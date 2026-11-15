import XCTest

@testable import Sytime

final class CoreTests: XCTestCase {
  func testJSONDecodesServerBooleansNullsAndNumbers() throws {
    let data = Data(
      #"{"id":42,"user_liked":true,"rating_avg":null,"price":3.5,"time":["noon"]}"#.utf8)
    let value = try JSONDecoder().decode(JSONValue.self, from: data)
    XCTAssertEqual(value.id, "42")
    XCTAssertTrue(value["user_liked"].flag)
    XCTAssertNil(value["rating_avg"].double)
    XCTAssertEqual(value["price"].double, 3.5)
    XCTAssertEqual(value["time"].array, [.string("noon")])
    XCTAssertEqual(
      try JSONDecoder().decode(JSONValue.self, from: JSONEncoder().encode(value)), value)
  }
  func testShanghaiDateCrossesYearAndLeapDay() {
    XCTAssertEqual(SytimeDate.shifted("2026-12-31", by: 1), "2027-01-01")
    XCTAssertEqual(SytimeDate.shifted("2024-02-28", by: 1), "2024-02-29")
    XCTAssertEqual(SytimeDate.day(Date(timeIntervalSince1970: 0)), "1970-01-01")
    let date = ISO8601DateFormatter().date(from: "2026-11-14T16:01:00Z")!
    XCTAssertEqual(SytimeDate.day(date), "2026-11-15")
  }
  func testPasswordUsesBackendUTF8ByteLimit() {
    XCTAssertTrue(PasswordRules.valid("CampusTest2026"))
    XCTAssertFalse(PasswordRules.valid("campustest2026"))
    XCTAssertFalse(PasswordRules.valid("CampusTest2026 "))
    XCTAssertFalse(PasswordRules.valid("Aa1" + String(repeating: "中", count: 24)))
  }
  func testOriginRejectsCredentialLeaksAndNonRootURLs() {
    XCTAssertNotNil(EndpointConfiguration.validated("https://campus.example"))
    XCTAssertNil(EndpointConfiguration.validated("https://name:x@campus.example"))
    XCTAssertNil(EndpointConfiguration.validated("https://campus.example/api"))
    XCTAssertNil(EndpointConfiguration.validated("https://campus.example?token=secret"))
    XCTAssertNil(EndpointConfiguration.validated("http://untrusted.example"))
  }
  @MainActor func testAPIURLCannotEscapeConfiguredOrigin() throws {
    let api = APIClient(baseURL: URL(string: "https://campus.example"))
    XCTAssertEqual(try api.url("/api/menu?all=1").host, "campus.example")
    XCTAssertThrowsError(try api.url("https://evil.example/api"))
    XCTAssertThrowsError(try api.url("//evil.example/api"))
    let path = APIClient.path("/api/shops", query: ["q": "苏州 & 面", "type": ""])
    let components = URLComponents(string: path)
    XCTAssertEqual(components?.queryItems?.first?.value, "苏州 & 面")
  }
  func testCampusCatalogHasSearchableAliasesAndValidGeometry() throws {
    let catalog = try XCTUnwrap(CampusCatalog.bundled)
    XCTAssertGreaterThan(catalog.places.count, 25)
    XCTAssertEqual(Set(catalog.places.map(\.id)).count, catalog.places.count)
    XCTAssertTrue(catalog.places.contains { $0.matches("墨子馆", category: "") && $0.name == "政道楼" })
    XCTAssertTrue(
      catalog.places.allSatisfy { (0...1000).contains($0.x) && (0...1540).contains($0.y) })
  }
  func testDeepLinksAreNativeRoutes() {
    XCTAssertEqual(AppRoute.parse(URL(string: "sytime://shop?id=12")!), .shop(12))
    XCTAssertEqual(AppRoute.parse(URL(string: "/dish.html?id=21&review=3")!), .dish(21))
    XCTAssertNil(AppRoute.parse(URL(string: "sytime://shop?id=-2")!))
  }
  func testGCJConversionDoesNotMoveCoordinatesOutsideChina() {
    let point = GCJ02.wgs84(latitude: 37.7749, longitude: -122.4194)
    XCTAssertEqual(point.latitude, 37.7749)
    XCTAssertEqual(point.longitude, -122.4194)
    let suzhou = GCJ02.wgs84(latitude: 31.3004, longitude: 120.6226)
    XCTAssertLessThan(abs(suzhou.latitude - 31.3004), 0.01)
    XCTAssertLessThan(suzhou.longitude, 120.6226)
  }
  func testNativeWikiMarkdownPreservesDocumentBlocksAndInternalLinks() {
    let source =
      "# 标题\n\n- [x] 完成\n\n```swift\nlet n = 1\n```\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n![](/api/wiki/images/abc-123)"
    let blocks = NativeMarkdown.blocks(source)
    XCTAssertEqual(blocks.count, 5)
    if case .code(let language) = blocks[2].kind {
      XCTAssertEqual(language, "swift")
      XCTAssertEqual(blocks[2].text, "let n = 1")
    } else {
      XCTFail("Expected fenced code")
    }
    if case .table(let rows) = blocks[3].kind {
      XCTAssertEqual(rows, [["A", "B"], ["1", "2"]])
    } else {
      XCTFail("Expected table")
    }
    let rich = NativeMarkdown.inline("[[42|政道楼]]", baseURL: URL(string: "https://campus.example"))
    XCTAssertEqual(String(rich.characters), "政道楼")
    XCTAssertEqual(rich.runs.first?.link?.query, "id=42")
    XCTAssertEqual(AppRoute.parse(URL(string: "sytime://wiki?id=42")!), .wikiEntry(42))
  }
  func testMergedSupplyRetainsLocationsAndPriceRange() {
    let rows: [JSONValue] = [
      .object(["dish_id": .number(1), "price": .number(5), "place": .string("一楼")]),
      .object(["dish_id": .number(1), "price": .number(8), "place": .string("二楼")]),
    ]
    let merged = SupplySummary.merge(rows)
    XCTAssertEqual(merged.count, 1)
    XCTAssertTrue(merged[0]["place"].string.contains("一楼"))
    XCTAssertTrue(merged[0]["place"].string.contains("二楼"))
    XCTAssertTrue(merged[0]["price_label"].string.contains("–"))
  }
}
