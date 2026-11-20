import XCTest

final class SmokeTests: XCTestCase {
  @MainActor override func setUpWithError() throws {
    continueAfterFailure = false
    XCUIDevice.shared.orientation = .portrait
  }

  @MainActor func testNativeNavigationCampusAndAppearance() throws {
    let app = XCUIApplication()
    app.launch()
    XCTAssertTrue(app.staticTexts["拾起校园\n每一寸时光"].waitForExistence(timeout: 15))
    let campus = app.buttons["走进苏中"]
    XCTAssertTrue(campus.exists)
    campus.tap()
    XCTAssertTrue(app.navigationBars["校园地图"].waitForExistence(timeout: 10))
    let directory = app.buttons["地点目录"]
    if directory.exists { directory.tap() }
    XCTAssertTrue(
      app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "伟长门")).firstMatch
        .waitForExistence(timeout: 10))
    let shot = XCTAttachment(screenshot: app.screenshot())
    shot.name = "校园导览"
    shot.lifetime = .keepAlways
    add(shot)
  }

  @MainActor func testCampusMapPinchesAndRotates() throws {
    let app = XCUIApplication()
    app.launch()
    XCTAssertTrue(app.buttons["走进苏中"].waitForExistence(timeout: 15))
    app.buttons["走进苏中"].tap()
    let atlas = app.otherElements["campus-atlas"]
    XCTAssertTrue(atlas.waitForExistence(timeout: 10))
    let landmark = atlas.buttons.containing(NSPredicate(format: "label BEGINSWITH %@", "春雨池"))
      .firstMatch
    XCTAssertTrue(landmark.exists)
    let original = landmark.frame
    atlas.pinch(withScale: 1.35, velocity: 1)
    XCTAssertGreaterThan(landmark.frame.width, original.width)
    atlas.rotate(.pi / 5, withVelocity: 1)
    XCTAssertNotEqual(atlas.value as? String, "0°")
    XCTAssertNotEqual(landmark.frame.midX, original.midX)
    app.buttons["回到校园全景"].tap()
    XCTAssertEqual(atlas.value as? String, "0°")
    XCTAssertTrue(landmark.exists)
  }

  @MainActor func testRotationDoesNotLoseCampus() throws {
    let app = XCUIApplication()
    app.launch()
    XCTAssertTrue(app.buttons["走进苏中"].waitForExistence(timeout: 15))
    app.buttons["走进苏中"].tap()
    XCUIDevice.shared.orientation = .landscapeLeft
    XCTAssertTrue(app.navigationBars["校园地图"].waitForExistence(timeout: 10))
    let directory = app.buttons["地点目录"]
    if directory.exists && directory.isHittable { directory.tap() }
    XCTAssertTrue(
      app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "伟长门")).firstMatch
        .waitForExistence(timeout: 10))
    let shot = XCTAttachment(screenshot: app.screenshot())
    shot.name = "校园横屏"
    shot.lifetime = .keepAlways
    add(shot)
    XCUIDevice.shared.orientation = .portrait
  }

  @MainActor func testLiveFoodAndLoginForms() throws {
    guard ProcessInfo.processInfo.environment["SYTIME_LIVE_TESTS"] == "1" else {
      throw XCTSkip("Requires disposable local API fixture")
    }
    let app = XCUIApplication()
    app.launchArguments = ["-serverURL", "http://127.0.0.1:4387"]
    app.launch()
    XCTAssertTrue(app.buttons["走进苏中"].waitForExistence(timeout: 15))
    if !app.buttons["下一餐吃什么"].isHittable { app.swipeUp(velocity: .slow) }
    XCTAssertTrue(app.buttons["下一餐吃什么"].waitForExistence(timeout: 15))
    app.buttons["下一餐吃什么"].tap()
    XCTAssertTrue(app.navigationBars["菜品与食谱"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.staticTexts["今天我吃了…"].waitForExistence(timeout: 15))
    let shot = XCTAttachment(screenshot: app.screenshot())
    shot.name = "原生食谱"
    shot.lifetime = .keepAlways
    add(shot)
    let mine = app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "我的"))
      .firstMatch
    XCTAssertTrue(mine.waitForExistence(timeout: 5))
    mine.tap()
    let login = app.buttons["登录"]
    if login.waitForExistence(timeout: 5) {
      login.tap()
      app.buttons["使用账号密码登录"].tap()
      let username = app.textFields["loginUsername"]
      XCTAssertTrue(username.waitForExistence(timeout: 10))
      username.tap()
      username.typeText("ios_student")
      let password = app.secureTextFields["loginPassword"]
      password.tap()
      password.typeText("CampusTest2026\n")
      let collections = app.descendants(matching: .any).matching(identifier: "我的收藏").firstMatch
      let loggedIn = collections.waitForExistence(timeout: 15)
      let accountShot = XCTAttachment(screenshot: app.screenshot())
      accountShot.name = "登录结果"
      accountShot.lifetime = .keepAlways
      add(accountShot)
      if !loggedIn {
        XCTContext.runActivity(named: "登录状态") { activity in
          let hierarchy = XCTAttachment(string: app.debugDescription)
          hierarchy.lifetime = .keepAlways
          activity.add(hierarchy)
        }
      }
      XCTAssertTrue(loggedIn)
    }
  }
  @MainActor func testLiveWikiReadingAndOutline() throws {
    guard ProcessInfo.processInfo.environment["SYTIME_LIVE_TESTS"] == "1" else {
      throw XCTSkip("Requires disposable API fixture")
    }
    let app = XCUIApplication()
    app.launchArguments = ["-serverURL", "http://127.0.0.1:4387"]
    app.launch()
    XCTAssertTrue(app.buttons["走进苏中"].waitForExistence(timeout: 15))
    app.swipeUp()
    let wiki = app.descendants(matching: .any).matching(identifier: "校园 Wiki").firstMatch
    XCTAssertTrue(wiki.waitForExistence(timeout: 10))
    wiki.tap()
    XCTAssertTrue(app.navigationBars["校园 Wiki"].waitForExistence(timeout: 10))
    let guide = app.staticTexts["原生校园指南"].firstMatch
    XCTAssertTrue(guide.waitForExistence(timeout: 15))
    guide.tap()
    XCTAssertTrue(app.staticTexts["欢迎来到校园"].waitForExistence(timeout: 10))
    let shot = XCTAttachment(screenshot: app.screenshot())
    shot.name = "原生 Wiki"
    shot.lifetime = .keepAlways
    add(shot)
  }
  @MainActor func testLiveShopDetailAndMap() throws {
    guard ProcessInfo.processInfo.environment["SYTIME_LIVE_TESTS"] == "1" else {
      throw XCTSkip("Requires disposable API fixture")
    }
    let app = XCUIApplication()
    app.launchArguments = ["-serverURL", "http://127.0.0.1:4387"]
    app.launch()
    XCTAssertTrue(app.buttons["走进苏中"].waitForExistence(timeout: 15))
    if !app.buttons["三元坊必吃榜"].isHittable { app.swipeUp(velocity: .slow) }
    app.buttons["三元坊必吃榜"].tap()
    let shop = app.staticTexts["原生联调面馆"].firstMatch
    XCTAssertTrue(shop.waitForExistence(timeout: 15))
    shop.tap()
    XCTAssertTrue(app.navigationBars["店铺详情"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.staticTexts["找到这家店"].exists)
    let shot = XCTAttachment(screenshot: app.screenshot())
    shot.name = "原生店铺详情"
    shot.lifetime = .keepAlways
    add(shot)
  }
}
