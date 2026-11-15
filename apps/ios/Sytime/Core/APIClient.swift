import Foundation
import Observation
import Security

struct APIError: LocalizedError {
  let status: Int
  let payload: JSONValue
  var errorDescription: String? {
    let raw = payload.text("message", payload.text("error"))
    if raw.range(of: "\\p{Han}", options: .regularExpression) != nil { return raw }
    let messages = [
      401: "登录已过期，请重新登录", 403: "你没有权限执行此操作", 404: "内容不存在或已被删除", 409: "内容已变化或已有待审核申请，请刷新查看",
      413: "图片太大，请选择较小的图片", 429: "操作太频繁，请稍后重试",
    ]
    return messages[status] ?? "服务暂时不可用，请稍后重试（\(status)）"
  }
}

enum EndpointConfiguration {
  static func validated(_ input: String) -> URL? {
    guard let u = URLComponents(string: input.trimmingCharacters(in: .whitespacesAndNewlines)),
      let host = u.host, !host.isEmpty, u.user == nil, u.password == nil,
      u.query == nil, u.fragment == nil, u.path.isEmpty || u.path == "/"
    else { return nil }
    #if DEBUG
      let local =
        host == "localhost" || host == "127.0.0.1" || host.hasSuffix(".local")
        || host.hasPrefix("192.168.") || host.hasPrefix("10.")
        || (host.split(separator: ".").count == 4 && host.hasPrefix("172.")
          && (16...31).contains(Int(host.split(separator: ".")[1]) ?? 0))
      guard u.scheme == "https" || (u.scheme == "http" && local) else { return nil }
    #else
      guard u.scheme == "https" else { return nil }
    #endif
    return u.url
  }
}

enum CredentialStore {
  static func query(_ origin: String) -> [String: Any] {
    [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: "cn.szzxai.sytime.session", kSecAttrAccount as String: origin,
    ]
  }
  static func read(_ origin: String) -> String? {
    var q = query(origin)
    q[kSecReturnData as String] = true
    q[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: CFTypeRef?
    guard SecItemCopyMatching(q as CFDictionary, &result) == errSecSuccess,
      let data = result as? Data
    else { return nil }
    return String(data: data, encoding: .utf8)
  }
  static func write(_ token: String?, origin: String) throws {
    let q = query(origin)
    SecItemDelete(q as CFDictionary)
    guard let token else { return }
    var item = q
    item[kSecValueData as String] = Data(token.utf8)
    item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    guard SecItemAdd(item as CFDictionary, nil) == errSecSuccess else {
      throw APIError(status: 0, payload: .strings(["error": "无法安全保存登录凭证，请重试"]))
    }
  }
}

/// Bearer sessions are scoped to one origin, stored in Keychain, never in preferences.
@MainActor @Observable
final class APIClient {
  var baseURL: URL?
  var token: String?
  var onUnauthorized: (() -> Void)?
  let session: URLSession
  init(baseURL: URL?, session: URLSession? = nil) {
    self.baseURL = baseURL
    if let session {
      self.session = session
    } else {
      let c = URLSessionConfiguration.ephemeral
      c.httpCookieStorage = nil
      c.httpShouldSetCookies = false
      c.timeoutIntervalForRequest = 25
      c.timeoutIntervalForResource = 60
      c.urlCache = nil
      self.session = URLSession(
        configuration: c, delegate: SameOriginRedirectDelegate(), delegateQueue: nil)
    }
  }
  func url(_ path: String) throws -> URL {
    guard let baseURL, path.hasPrefix("/"), !path.hasPrefix("//"),
      let url = URL(string: path, relativeTo: baseURL)?.absoluteURL, url.host == baseURL.host,
      url.scheme == baseURL.scheme, url.port == baseURL.port
    else {
      throw APIError(status: 0, payload: .strings(["error": "暂时无法连接拾光酥糕，请稍后重试"]))
    }
    return url
  }
  func request(
    _ path: String, method: String = "GET", body: JSONValue? = nil, authenticated: Bool = true
  ) async throws -> JSONValue {
    var r = URLRequest(url: try url(path))
    r.httpMethod = method
    r.setValue("application/json", forHTTPHeaderField: "Accept")
    if let body {
      r.httpBody = try JSONEncoder().encode(body)
      r.setValue("application/json", forHTTPHeaderField: "Content-Type")
    }
    return try await send(r, authenticated: authenticated)
  }
  func upload(
    _ path: String, fields: [String: String], image: Data? = nil, imageField: String = "image",
    method: String = "POST"
  ) async throws -> JSONValue {
    let boundary = "Sytime-" + UUID().uuidString
    var data = Data()
    func append(_ string: String) { data.append(Data(string.utf8)) }
    for (key, value) in fields.sorted(by: { $0.key < $1.key }) {
      append("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(key)\"\r\n\r\n\(value)\r\n")
    }
    if let image {
      guard image.count <= 2 * 1024 * 1024 else { throw APIError(status: 413, payload: .null) }
      append(
        "--\(boundary)\r\nContent-Disposition: form-data; name=\"\(imageField)\"; filename=\"photo.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n"
      )
      data.append(image)
      append("\r\n")
    }
    append("--\(boundary)--\r\n")
    var r = URLRequest(url: try url(path))
    r.httpMethod = method
    r.httpBody = data
    r.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
    return try await send(r, authenticated: true)
  }
  private func send(_ original: URLRequest, authenticated: Bool) async throws -> JSONValue {
    var r = original
    let sentToken = authenticated ? token : nil
    if let sentToken { r.setValue("Bearer \(sentToken)", forHTTPHeaderField: "Authorization") }
    let (data, response) = try await session.data(for: r)
    guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
    let payload = (try? JSONDecoder().decode(JSONValue.self, from: data)) ?? .null
    guard (200..<300).contains(http.statusCode) else {
      if http.statusCode == 401, sentToken != nil, token == sentToken { onUnauthorized?() }
      throw APIError(status: http.statusCode, payload: payload)
    }
    guard !payload.isNull else {
      throw APIError(status: 502, payload: .strings(["error": "服务器响应格式不正确，请检查连接地址"]))
    }
    return payload
  }
  nonisolated static func path(_ path: String, query: [String: String]) -> String {
    var c = URLComponents()
    c.path = path
    c.queryItems = query.filter { !$0.value.isEmpty }.sorted { $0.key < $1.key }.map {
      URLQueryItem(name: $0.key, value: $0.value)
    }
    return c.string ?? path
  }
}

private final class SameOriginRedirectDelegate: NSObject, URLSessionTaskDelegate {
  func urlSession(
    _ session: URLSession, task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
    completionHandler: @escaping (URLRequest?) -> Void
  ) {
    let old = task.originalRequest?.url
    let next = request.url
    completionHandler(
      old?.host == next?.host && old?.port == next?.port && old?.scheme == next?.scheme
        ? request : nil)
  }
}
