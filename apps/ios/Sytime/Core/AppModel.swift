import Network
import Observation
import SwiftUI

@MainActor @Observable
final class AppModel {
  let api: APIClient
  var user: JSONValue = .null
  var unreadCount = 0
  var isOffline = false
  var showLogin = false
  var showConnection = false
  var notice: String?
  var sessionRevision = 0
  var pendingRoute: AppRoute?
  private let monitor = NWPathMonitor()
  var isLoggedIn: Bool { api.token != nil }
  var isStudent: Bool { ["student", "admin", "operator"].contains(user["role"].string) }
  var isStaff: Bool { ["admin", "operator"].contains(user["role"].string) }
  var origin: String { api.baseURL?.absoluteString ?? "" }

  init() {
    let args = ProcessInfo.processInfo.arguments
    var configured =
      UserDefaults.standard.string(forKey: "serverURL") ?? Bundle.main.object(
        forInfoDictionaryKey: "SytimeServerURL") as? String ?? "https://time.szzxclubunion.cn"
    #if DEBUG
      if let i = args.firstIndex(of: "-serverURL"), args.indices.contains(i + 1) {
        configured = args[i + 1]
      }
    #endif
    let url =
      EndpointConfiguration.validated(configured) ?? URL(string: "https://time.szzxclubunion.cn")!
    api = APIClient(baseURL: url)
    api.token = CredentialStore.read(url.absoluteString)
    api.onUnauthorized = { [weak self] in
      self?.clearSession()
      self?.notice = "登录已过期，请重新登录。当前浏览内容已保留。"
    }
    monitor.pathUpdateHandler = { [weak self] path in
      Task { @MainActor in self?.isOffline = path.status != .satisfied }
    }
    monitor.start(queue: DispatchQueue(label: "cn.szzxai.sytime.network"))
  }
  func connect(_ input: String) throws {
    guard let url = EndpointConfiguration.validated(input) else {
      throw APIError(status: 0, payload: .strings(["error": "请输入完整的 HTTPS 站点地址，不包含路径、账号或查询参数"]))
    }
    if url != api.baseURL {
      api.token = nil
      user = .null
      unreadCount = 0
      api.baseURL = url
      api.token = CredentialStore.read(url.absoluteString)
      UserDefaults.standard.set(url.absoluteString, forKey: "serverURL")
      sessionRevision += 1
    }
  }
  func login(username: String, password: String) async throws {
    let value = try await api.request(
      "/api/login", method: "POST", body: .strings(["username": username, "password": password]),
      authenticated: false)
    try await acceptLogin(value)
  }
  func acceptLogin(_ value: JSONValue) async throws {
    guard !value["token"].string.isEmpty, !value["user"].isNull else {
      throw APIError(status: 502, payload: .null)
    }
    try CredentialStore.write(value["token"].string, origin: origin)
    api.token = value["token"].string
    user = value["user"]
    sessionRevision += 1
    showLogin = false
    await refreshAccount()
  }
  func clearSession() {
    try? CredentialStore.write(nil, origin: origin)
    api.token = nil
    user = .null
    unreadCount = 0
    sessionRevision += 1
  }
  func logout() async {
    do {
      let value = try await api.request("/api/logout", method: "POST")
      if let url = URL(string: value["logout_url"].string), url.scheme == "https" {
        await UIApplication.shared.open(url)
      }
      clearSession()
    } catch { notice = "退出未完成：\(error.localizedDescription)。请重试以结束服务器会话。" }
  }
  func refreshAccount() async {
    guard isLoggedIn else { return }
    let revision = sessionRevision
    do {
      let value = try await api.request("/api/user/profile")
      guard revision == sessionRevision else { return }
      user = value["user"]
      let counts = try await api.request("/api/messages/unread-count")
      guard revision == sessionRevision else { return }
      unreadCount = counts["count"].int
    } catch {
      if !(error is CancellationError) {
        // Public browsing remains available during reconnection.
      }
    }
  }
  func requireAccount(student: Bool = false) -> Bool {
    guard isLoggedIn else {
      showLogin = true
      return false
    }
    guard !student || isStudent else {
      showLogin = true
      notice = "请通过社盟账号登录，即可参与点赞、评价和店铺推荐。"
      return false
    }
    return true
  }
  func act(_ path: String, method: String = "POST", body: JSONValue? = nil, success: String = "已保存")
    async -> Bool
  {
    do {
      let value = try await api.request(path, method: method, body: body)
      if value["reauthenticate"].flag { clearSession() }
      notice = success
      return true
    } catch is CancellationError { return false } catch {
      notice = error.localizedDescription
      return false
    }
  }
}

enum AppRoute: Hashable, Identifiable {
  case wiki(String)
  case wikiEntry(Int)
  case dish(Int)
  case shop(Int)
  case profile(Int)
  case announcements, inbox, settings, collections, submissions
  case submission(Int)
  case titles, tickets, about, admin
  case adminRequest(Int)
  case adminTickets
  case collection(Int, Bool)
  var id: String { String(describing: self) }
  static func parse(_ url: URL) -> AppRoute? {
    let name =
      url.scheme == "sytime" ? (url.host ?? "") : url.deletingPathExtension().lastPathComponent
    let q = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
    let id = Int(q.first { $0.name == "id" }?.value ?? "") ?? 0
    switch name {
    case "wiki": return id > 0 ? .wikiEntry(id) : .wiki(q.first { $0.name == "q" }?.value ?? "")
    case "dish": return id > 0 ? .dish(id) : nil
    case "shop": return id > 0 ? .shop(id) : nil
    case "user": return id > 0 ? .profile(id) : nil
    case "announcements": return .announcements
    case "inbox": return .inbox
    case "profile", "submissions":
      if let value = Int(q.first { $0.name == "submission" }?.value ?? ""), value > 0 {
        return .submission(value)
      }
      return .submissions
    case "settings": return url.fragment == "tickets" ? .tickets : .settings
    case "tickets": return .tickets
    case "admin":
      if let value = Int(q.first { $0.name == "request" }?.value ?? ""), value > 0 {
        return .adminRequest(value)
      }
      return url.fragment == "tickets" ? .adminTickets : .admin
    default: return nil
    }
  }
}
