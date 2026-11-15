import XCTest

@testable import Sytime

@MainActor final class LiveAPITests: XCTestCase {
  func testRealServerNativeSessionCollectionAndModeration() async throws {
    guard ProcessInfo.processInfo.environment["SYTIME_LIVE_TESTS"] == "1" else {
      throw XCTSkip("Start the disposable test server and set TEST_RUNNER_SYTIME_LIVE_TESTS=1")
    }
    let api = APIClient(baseURL: URL(string: "http://127.0.0.1:4387"))
    let login = try await api.request(
      "/api/login", method: "POST",
      body: .strings(["username": "ios_student", "password": "CampusTest2026"]),
      authenticated: false)
    api.token = login["token"].string
    let profile = try await api.request("/api/user/profile")
    XCTAssertEqual(profile["user"]["role"].string, "student")
    let menu = try await api.request("/api/menu?all=1", authenticated: false)
    XCTAssertFalse(menu["records"].array.isEmpty)
    let shops = try await api.request("/api/shops")
    let shop = try XCTUnwrap(shops["shops"].array.first)
    let created = try await api.request(
      "/api/collections", method: "POST",
      body: .strings(["section": "shops", "name": "原生联调 " + UUID().uuidString.prefix(8)]))
    let id = created["collection"].id
    let added = try await api.request(
      "/api/collections/\(id)/items", method: "POST",
      body: .object(["item_type": .string("shop"), "item_id": shop["id"]]))
    XCTAssertTrue(added["added"].flag)
    let duplicate = try await api.request(
      "/api/collections/\(id)/items", method: "POST",
      body: .object(["item_type": .string("shop"), "item_id": shop["id"]]))
    XCTAssertFalse(duplicate["added"].flag)
    let renamed = try await api.request(
      "/api/collections/\(id)", method: "PUT", body: .strings(["name": "放学后的收藏"]))
    XCTAssertEqual(renamed["collection"]["name"].string, "放学后的收藏")
    let listed = try await api.request("/api/collections/\(id)/items?page=1")
    XCTAssertEqual(listed["items"].array.first?["shop"]["id"], shop["id"])
    let dish = try XCTUnwrap(menu["records"].array.first)
    let review = try await api.upload(
      "/api/recipes",
      fields: [
        "dish_id": dish["dish_id"].string, "name": dish["name"].string, "rating": "4",
        "comment": "原生客户端集成测试",
      ])
    XCTAssertEqual(review["status"].string, "pending")
    let submissions = try await api.request("/api/user/submissions")
    XCTAssertTrue(
      submissions["requests"].array.contains {
        $0["kind"].string == "dish_review" && $0["status"].string == "pending"
      })
    _ = try await api.request("/api/user/submissions/\(review.id)/withdraw", method: "POST")
    _ = try await api.request(
      "/api/tickets", method: "POST",
      body: .strings(["title": "原生测试工单", "content": "验证工单请求和响应", "visibility": "operator"]))
    let tickets = try await api.request("/api/tickets/mine")
    XCTAssertFalse(tickets["tickets"].array.isEmpty)
    _ = try await api.request("/api/logout", method: "POST")
    do {
      _ = try await api.request("/api/user/profile")
      XCTFail("Logged-out token must be revoked")
    } catch let e as APIError { XCTAssertEqual(e.status, 401) }
  }
  func testWikiSubmissionLockHistoryAndWithdrawal() async throws {
    guard ProcessInfo.processInfo.environment["SYTIME_LIVE_TESTS"] == "1" else {
      throw XCTSkip("Requires disposable API fixture")
    }
    let api = APIClient(baseURL: URL(string: "http://127.0.0.1:4387"))
    let login = try await api.request(
      "/api/login", method: "POST",
      body: .strings(["username": "ios_student", "password": "CampusTest2026"]),
      authenticated: false)
    api.token = login["token"].string
    let catalog = try await api.request("/api/wiki?q=nativeguide", authenticated: false)
    let row = try XCTUnwrap(catalog["entries"].array.first)
    let detail = try await api.request("/api/wiki/entries/\(row.id)", authenticated: false)
    let entry = detail["entry"]
    let revision = try await api.request(
      "/api/wiki/entries/\(row.id)/revisions/\(entry["current_revision_id"].int)",
      authenticated: false)
    XCTAssertEqual(revision["revision"]["markdown"], entry["markdown"])
    let edit: JSONValue = .object([
      "title": entry["title"], "folder_id": entry["folder_id"],
      "markdown": .string(entry["markdown"].string + "\n补充内容"), "summary": .string("原生编辑联调"),
      "aliases": entry["aliases"], "images": .array([]), "sources": .array([]),
      "base_revision_id": entry["current_revision_id"],
    ])
    let submitted = try await api.request(
      "/api/wiki/entries/\(row.id)/submissions", method: "POST", body: edit)
    let locked = try await api.request("/api/wiki/entries/\(row.id)", authenticated: false)
    XCTAssertTrue(locked["entry"]["auto_locked"].flag)
    XCTAssertEqual(locked["entry"]["markdown"], entry["markdown"])
    _ = try await api.request("/api/user/submissions/\(submitted.id)/withdraw", method: "POST")
    let unlocked = try await api.request("/api/wiki/entries/\(row.id)", authenticated: false)
    XCTAssertFalse(unlocked["entry"]["auto_locked"].flag)
    _ = try await api.request("/api/logout", method: "POST")
  }
}
