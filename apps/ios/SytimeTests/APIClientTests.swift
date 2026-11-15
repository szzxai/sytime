import XCTest

@testable import Sytime

private final class StubProtocol: URLProtocol {
  static var handler: ((URLRequest) throws -> (Int, Data))?
  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
  override func startLoading() {
    do {
      let (status, data) = try Self.handler!(request)
      client?.urlProtocol(
        self,
        didReceive: HTTPURLResponse(
          url: request.url!, statusCode: status, httpVersion: nil,
          headerFields: ["Content-Type": "application/json"])!, cacheStoragePolicy: .notAllowed)
      client?.urlProtocol(self, didLoad: data)
      client?.urlProtocolDidFinishLoading(self)
    } catch { client?.urlProtocol(self, didFailWithError: error) }
  }
  override func stopLoading() {}
}

@MainActor final class APIClientTests: XCTestCase {
  private func client() -> APIClient {
    let c = URLSessionConfiguration.ephemeral
    c.protocolClasses = [StubProtocol.self]
    let api = APIClient(
      baseURL: URL(string: "https://campus.example"), session: URLSession(configuration: c))
    api.token = "test-session-value"
    return api
  }
  func testBearerAndJSONBodyReachOnlyNativeAPI() async throws {
    let api = client()
    StubProtocol.handler = { request in
      XCTAssertEqual(
        request.value(forHTTPHeaderField: "Authorization"), "Bearer test-session-value")
      XCTAssertEqual(request.httpMethod, "PUT")
      XCTAssertEqual(request.value(forHTTPHeaderField: "Content-Type"), "application/json")
      return (200, Data(#"{"ok":true}"#.utf8))
    }
    let result = try await api.request(
      "/api/user/settings", method: "PUT", body: .strings(["recipe_default_view": "daily"]))
    XCTAssertTrue(result["ok"].flag)
  }
  func testOnlyAuthenticated401ExpiresSession() async throws {
    let api = client()
    var expired = false
    api.onUnauthorized = { expired = true }
    StubProtocol.handler = { request in
      XCTAssertNil(request.value(forHTTPHeaderField: "Authorization"))
      return (401, Data(#"{"error":"invalid username or password"}"#.utf8))
    }
    do {
      _ = try await api.request("/api/login", method: "POST", authenticated: false)
      XCTFail()
    } catch {}
    XCTAssertFalse(expired)
    StubProtocol.handler = { _ in (401, Data(#"{"error":"login required"}"#.utf8)) }
    do {
      _ = try await api.request("/api/user/profile")
      XCTFail()
    } catch {}
    XCTAssertTrue(expired)
  }
  func testNonJSONSuccessIsAnErrorInsteadOfAnEmptyMenu() async throws {
    let api = client()
    StubProtocol.handler = { _ in (200, Data("<html>Wrong server</html>".utf8)) }
    do {
      _ = try await api.request("/api/menu")
      XCTFail("HTML cannot be treated as a menu")
    } catch let error as APIError { XCTAssertEqual(error.status, 502) }
  }
  func testOversizeUploadFailsBeforeNetwork() async throws {
    let api = client()
    StubProtocol.handler = { _ in
      XCTFail("Should not send oversize images")
      return (200, Data())
    }
    do {
      _ = try await api.upload(
        "/api/recipes", fields: [:], image: Data(repeating: 1, count: 2 * 1024 * 1024 + 1))
      XCTFail()
    } catch let error as APIError { XCTAssertEqual(error.status, 413) }
  }
  func testServerValidationMessageIsPreserved() async throws {
    let api = client()
    StubProtocol.handler = { _ in (422, Data(#"{"error":"已有待审核申请，请先等待审核或撤回"}"#.utf8)) }
    do {
      _ = try await api.request("/api/recipes", method: "POST")
      XCTFail()
    } catch { XCTAssertEqual(error.localizedDescription, "已有待审核申请，请先等待审核或撤回") }
  }
}
