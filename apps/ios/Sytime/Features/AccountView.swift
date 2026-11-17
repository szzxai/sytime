import AuthenticationServices
import CryptoKit
import SwiftUI

struct ConnectionView: View {
  @Environment(AppModel.self) private var app
  @Environment(\.dismiss) private var dismiss
  @State private var address = ""
  @State private var error: String?
  @State private var connecting = false
  var body: some View {
    Form {
      Section {
        Label("连接拾光酥糕站点", systemImage: "network").font(.headline)
        TextField("https://time.szzxclubunion.cn", text: $address).keyboardType(.URL)
          .textInputAutocapitalization(
            .never
          ).autocorrectionDisabled().accessibilityIdentifier("serverAddress")
        Text("默认使用拾光酥糕官方站点，通常无需更改。").font(.footnote).foregroundStyle(
          .secondary)
      }
      if let error { Section { Text(error).foregroundStyle(.red) } }
      Section {
        Button(connecting ? "连接中…" : "连接并保存") { Task { await connect() } }.disabled(
          connecting || address.isEmpty
        ).accessibilityIdentifier("connectServer")
      }
    }.navigationTitle("连接设置").navigationBarTitleDisplayMode(.inline)
      .toolbar { ToolbarItem(placement: .cancellationAction) { Button("关闭") { dismiss() } } }
      .task { address = app.origin }
  }
  private func connect() async {
    guard let url = EndpointConfiguration.validated(address) else {
      error = "请输入有效的站点地址。"
      return
    }
    connecting = true
    error = nil
    defer { connecting = false }
    do {
      let candidate = APIClient(baseURL: url)
      let value = try await candidate.request("/api/menu", authenticated: false)
      guard case .array = value["records"], case .array = value["weeks"] else {
        throw APIError(status: 502, payload: .null)
      }
      try app.connect(address)
      dismiss()
    } catch { self.error = error.localizedDescription }
  }
}

struct LoginView: View {
  @Environment(AppModel.self) private var app
  @Environment(\.dismiss) private var dismiss
  var passwordLogin = false
  @State private var sso = SSOAuthentication()
  @State private var username = ""
  @State private var password = ""
  @State private var saving = false
  @State private var error: String?
  @State private var banned: JSONValue = .null
  @State private var appealing = false
  @State private var connection = false
  @FocusState private var passwordFocused: Bool
  var body: some View {
    Form {
      if !passwordLogin {
        Section {
          Label("校园时光，从这里继续", systemImage: "sun.horizon").font(.headline)
          Text("地图、食谱和周边美食无需登录即可浏览。").font(.subheadline).foregroundStyle(.secondary)
        }
        Section("登录方式") {
          Button("通过社盟账号登录") { Task { await loginSSO() } }.disabled(saving)
          NavigationLink("使用账号密码登录") { LoginView(passwordLogin: true) }.disabled(saving)
          Text("学生使用社盟账号，管理员及现有账号使用账号密码登录。").font(.footnote).foregroundStyle(.secondary)
        }
      }
      if passwordLogin {
        Section("账号密码登录") {
          TextField("用户名", text: $username).textContentType(.username).textInputAutocapitalization(
            .never
          ).autocorrectionDisabled().accessibilityIdentifier("loginUsername")
          SecureField("密码", text: $password).textContentType(.password)
            .accessibilityIdentifier("loginPassword")
            .focused($passwordFocused).submitLabel(.go).onSubmit { Task { await submit() } }
        }
      }
      if let error {
        Section { Text(error).foregroundStyle(.red).accessibilityIdentifier("loginError") }
      }
      if !banned.isNull {
        Section("账号已被封禁") {
          Text(banned["ban_reason"].string)
          if !banned["ban_image"].string.isEmpty {
            RemotePicture(path: banned["ban_image"].string, fit: true).frame(maxHeight: 220)
          }
          if !banned["last_appeal"].isNull {
            LabeledContent("最近申诉", value: statusNames[banned["last_appeal"]["status"].string] ?? "")
            Text(banned["last_appeal"]["reason"].string)
          }
          if banned["allow_appeal"].flag {
            Button("提交申诉") { appealing = true }
          } else {
            Text("此账号不允许在线申诉，请联系运营者。").foregroundStyle(.secondary)
          }
        }
      }
      if passwordLogin {
        Section {
          Button(saving ? "处理中…" : "登录") {
            passwordFocused = false
            Task { await submit() }
          }.disabled(
            saving || username.isEmpty || password.isEmpty
          ).accessibilityIdentifier("submitLogin")
        }
      }
    }.navigationTitle(passwordLogin ? "账号密码登录" : "欢迎回来").navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() }.disabled(saving) }
      }
      .sheet(isPresented: $appealing) {
        NavigationStack {
          AppealView(
            username: username, password: password, appealToken: banned["appeal_token"].string)
        }
      }
      .sheet(isPresented: $connection) { NavigationStack { ConnectionView() } }
  }
  private func loginSSO() async {
    saving = true
    error = nil
    banned = .null
    defer { saving = false }
    do {
      let credential = try await sso.authenticate(origin: app.origin)
      let value = try await app.api.request(
        "/api/sso/native/exchange", method: "POST",
        body: .strings(["ticket": credential.ticket, "verifier": credential.verifier]),
        authenticated: false)
      try await app.acceptLogin(value)
      dismiss()
    } catch let e as APIError {
      error = e.localizedDescription
      if e.payload["error"].string == "banned" { banned = e.payload }
    } catch { self.error = error.localizedDescription }
  }
  private func submit() async {
    saving = true
    error = nil
    banned = .null
    defer { saving = false }
    do {
      try await app.login(username: username, password: password)
      dismiss()
    } catch let e as APIError {
      error = e.localizedDescription
      if e.payload["error"].string == "banned" { banned = e.payload }
    } catch { self.error = error.localizedDescription }
  }
}

struct AppealView: View {
  @Environment(AppModel.self) private var app
  @Environment(\.dismiss) private var dismiss
  let username: String
  let password: String
  var appealToken: String = ""
  @State private var reason = ""
  @State private var photo: Data?
  @State private var error: String?
  @State private var saving = false
  var body: some View {
    Form {
      Section("申诉说明") {
        TextField("申诉理由（必填，最多 500 字）", text: $reason, axis: .vertical).lineLimit(5...12)
      }
      Section { PhotoField(data: $photo) }
      if let error { Text(error).foregroundStyle(.red) }
    }.navigationTitle("封禁申诉").interactiveDismissDisabled(!reason.isEmpty || saving)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() }.disabled(saving) }
        ToolbarItem(placement: .confirmationAction) {
          Button(saving ? "提交中…" : "提交") {
            Task {
              saving = true
              defer { saving = false }
              var fields = [
                "username": username, "password": password, "appeal_reason": reason,
                "appeal_token": appealToken,
              ]
              if let photo {
                fields["appeal_image"] = "data:image/jpeg;base64," + photo.base64EncodedString()
              }
              do {
                _ = try await app.api.request(
                  "/api/user/appeal", method: "POST", body: .strings(fields), authenticated: false)
                dismiss()
                app.notice = "申诉已提交，请等待审核。可再次登录查看申诉状态。"
              } catch { self.error = error.localizedDescription }
            }
          }.disabled(
            saving || reason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
              || reason.count > 500)
        }
      }
  }
}

struct AccountView: View {
  @Environment(AppModel.self) private var app
  var body: some View {
    List {
      Section {
        if app.isLoggedIn {
          NavigationLink {
            ProfileView()
          } label: {
            PersonLabel(user: app.user).padding(.vertical, 10)
          }
        } else {
          VStack(alignment: .leading, spacing: 14) {
            Image(systemName: "person.crop.circle").font(.system(size: 48)).foregroundStyle(.tint)
            Text("留下你的校园足迹").font(.title2.bold())
            Text("登录后收藏喜欢的小店，参与校园共建。").foregroundStyle(.secondary)
            Button("登录") { app.showLogin = true }.buttonStyle(.glassProminent)
          }.padding(.vertical, 12)
        }
      }
      if app.isLoggedIn {
        Section("我的校园生活") {
          NavigationLink(value: AppRoute.inbox) {
            HStack {
              Label("消息箱", systemImage: "bell")
              Spacer()
              if app.unreadCount > 0 {
                Text(app.unreadCount > 99 ? "99+" : String(app.unreadCount)).font(.caption.bold())
                  .foregroundStyle(.white).padding(6).background(.tint, in: .capsule)
              }
            }
          }
          NavigationLink("我的收藏", value: AppRoute.collections)
          NavigationLink("我的头衔", value: AppRoute.titles)
          NavigationLink("我的申请", value: AppRoute.submissions)
          NavigationLink("问题与建议", value: AppRoute.tickets)
        }
        if app.isStaff { Section { NavigationLink("审核与运营", value: AppRoute.admin) } }
      }
      Section {
        NavigationLink("设置", value: AppRoute.settings)
        NavigationLink("关于拾光酥糕", value: AppRoute.about)
      }
      if app.isLoggedIn {
        Section { Button("退出当前设备", role: .destructive) { Task { await app.logout() } } }
      }
    }.navigationTitle("我的").task { await app.refreshAccount() }
  }
}

struct ProfileView: View {
  @Environment(AppModel.self) private var app
  var userID: Int? = nil
  @State private var form: FormPresentation?
  @State private var revision = 0
  private var own: Bool { userID == nil || userID == app.user["id"].int }
  var body: some View {
    APIContent(
      path: own ? "/api/user/profile" : "/api/users/\(userID ?? 0)/profile", authenticated: own
    ) { data in
      let user = data["user"]
      List {
        Section {
          PersonLabel(user: user).padding(.vertical, 12)
          Text(user.text("signature", "还没有留下个性签名")).foregroundStyle(.secondary)
        }
        Section("公开资料") {
          if user["auth_source"].string == "sso" {
            LabeledContent("姓名（社盟同步）", value: user["nickname"].string)
          } else {
            LabeledContent("用户名", value: user["username"].string)
          }
          LabeledContent("展示 ID", value: user["display_id"].string)
        }
        if own {
          Section("修改资料 · 审核后公开") {
            ForEach(
              [("nickname", "昵称", 20), ("signature", "个性签名", 200), ("display_id", "展示 ID", 24)]
                .filter { $0.0 != "nickname" || user["auth_source"].string != "sso" },
              id: \.0
            ) { item in
              Button("修改\(item.1)") {
                form = FormPresentation(
                  title: "修改\(item.1)", path: "/api/user/\(item.0)", method: "PUT",
                  fields: [
                    FormField(
                      item.0, item.1, item.0 == "signature" ? .multiline : .text,
                      required: item.0 != "signature", max: item.2)
                  ], initial: [item.0: user[item.0].string], success: "资料已提交审核，公开资料在通过前保持不变")
              }
            }
            Button("更换头像") {
              form = FormPresentation(
                title: "更换头像", path: "/api/user/avatar", success: "头像已提交审核", photoField: "avatar",
                multipart: true)
            }
          }
          Section {
            NavigationLink("收藏夹", value: AppRoute.collections)
            NavigationLink("头衔与成就", value: AppRoute.titles)
            NavigationLink("我的申请", value: AppRoute.submissions)
          }
        } else {
          Section("公开收藏夹") {
            PublicCollections(userID: userID ?? 0)
          }
          Section("已获得头衔") { PublicTitles(userID: userID ?? 0) }
        }
      }
    }.id(revision).navigationTitle(own ? "个人主页" : "同学主页")
      .sheet(item: $form) {
        $0.view {
          revision += 1
          Task { await app.refreshAccount() }
        }
      }
  }
}

struct SettingsView: View {
  @State private var sso = SSOAuthentication()
  @Environment(AppModel.self) private var app
  @AppStorage("appearance") private var appearance = "system"
  @State private var form: FormPresentation?
  @State private var revision = 0
  var body: some View {
    List {
      Section("外观") {
        Picker("主题", selection: $appearance) {
          Text("跟随系统").tag("system")
          Text("浅色").tag("light")
          Text("深色").tag("dark")
        }
      }
      if app.isLoggedIn {
        Section("浏览偏好") {
          Button("首页、食谱与必吃榜偏好") {
            let u = app.user
            let fields = [
              FormField(
                "default_page", "默认首页",
                .choice([("index.html", "拾光首页"), ("map.html", "校园地图"), ("recipe.html", "菜品与食谱")])),
              FormField(
                "recipe_default_view", "食谱默认视图",
                .choice([
                  ("daily", "今日与明日"), ("weekly", "每周食谱"), ("all", "全部菜品"), ("reviews", "大家的评价"),
                ])),
              FormField(
                "shop_default_sort", "必吃榜默认排序方式",
                .choice(
                  ShopSorting.methods.map {
                    ($0, shopSorts[$0] ?? $0)
                  }),
                onChange: { values, sort in values["shop_default_order"] = ShopSorting.defaultOrder(sort) }),
              FormField(
                "shop_default_order", "必吃榜默认排序顺序",
                .choice([("asc", "从低到高"), ("desc", "从高到低")]),
                visibleWhen: { ShopSorting.hasOrder($0["shop_default_sort"] ?? "campus") }),
              FormField("shop_default_type", "默认店铺类型（留空表示全部）", required: false),
              FormField(
                "shop_layout_mode", "详情布局", .choice([("auto", "自动适配"), ("manual", "手动选择")])),
              FormField("shop_layout", "手动布局", .choice([("stacked", "纵向"), ("split", "双栏")])),
              FormField("collection_default_public", "新建收藏夹默认公开", .toggle, required: false),
              FormField("show_role", "公开显示身份标签", .toggle, required: false),
            ]
            let defaults = [
              "default_page": "index.html", "recipe_default_view": "daily",
              "shop_default_sort": "campus", "shop_layout_mode": "auto", "shop_layout": "stacked",
              "show_role": "1", "collection_default_public": "0",
            ]
            var initial = Dictionary(
              uniqueKeysWithValues: fields.map { ($0.id, u.text($0.id, defaults[$0.id] ?? "")) })
            let sorting = ShopSorting.normalized(
              u.text("shop_default_sort", "campus"), order: u["shop_default_order"].string)
            initial["shop_default_sort"] = sorting.sort
            initial["shop_default_order"] = sorting.order
            form = FormPresentation(
              title: "浏览偏好", path: "/api/user/settings", method: "PUT", fields: fields,
              initial: initial,
              explanation: "偏好保存到你的账号。普通用户仅可使用私密收藏夹；已有收藏夹不随默认公开设置改变。")
          }
          NavigationLink("管理默认收藏夹", value: AppRoute.collections)
        }
        Section("账号安全") {
          if app.user["auth_source"].string != "sso" {
            Button("修改密码") {
              form = FormPresentation(
                title: "修改密码", path: "/api/user/password", method: "PUT",
                fields: [
                  FormField("oldPassword", "旧密码", .password),
                  FormField("newPassword", "新密码", .password),
                  FormField("confirmPassword", "确认新密码", .password),
                ], explanation: PasswordRules.explanation, success: "密码已修改，所有设备已退出，请重新登录",
                confirmation: "修改密码会结束所有设备上的登录。确认继续？")
            }
            Button("撤销所有设备会话", role: .destructive) {
              form = FormPresentation(
                title: "撤销全部会话", path: "/api/user/sessions/revoke",
                fields: [FormField("password", "当前密码", .password)], success: "所有设备已退出登录",
                confirmation: "将结束包括当前设备在内的所有会话。确认继续？")
            }
          } else {
            Text("姓名与账号密码由社盟管理。").foregroundStyle(.secondary)
            Button("重新验证并撤销所有设备会话", role: .destructive) {
              Task {
                do {
                  let credential = try await sso.authenticate(origin: app.origin)
                  _ = try await app.api.request(
                    "/api/sso/native/exchange", method: "POST",
                    body: .strings([
                      "ticket": credential.ticket, "verifier": credential.verifier,
                      "intent": "revoke",
                    ]))
                  app.clearSession()
                  app.notice = "所有设备的本站会话已退出"
                } catch { app.notice = error.localizedDescription }
              }
            }
          }
        }
        Section { NavigationLink("工单与反馈", value: AppRoute.tickets) }
      }
      Section("隐私与连接") {
        Button("服务器地址") { app.showConnection = true }
        NavigationLink("隐私说明") {
          List {
            Section("账号与内容") {
              Text("登录凭证安全保存在本机。社盟登录会将社盟唯一身份和真实姓名同步至拾光酥糕。评价、资料变更和工单会将你填写的内容提交到本站。")
            }
            Section("公开范围") {
              Text("地图、食谱、店铺和已审核内容对外公开。头像、评价图片和公开资料在审核通过后公开。私密收藏夹仅本人可见；工单按所选范围对工作人员可见。")
            }
            Section("设备权限") { Text("图片使用系统照片选择器，你只需授权所选照片。App 不请求定位权限，不包含第三方广告或追踪 SDK。") }
            Section("数据问题") { NavigationLink("通过工单联系维护团队", value: AppRoute.tickets) }
          }.navigationTitle("隐私说明")
        }
      }
    }.id(revision).navigationTitle("设置")
      .sheet(item: $form) {
        $0.view {
          revision += 1
          Task { await app.refreshAccount() }
        }
      }
  }
}

/// The site performs OIDC; the app redeems a short-lived ticket bound to its own verifier.
@MainActor
final class SSOAuthentication: NSObject, ASWebAuthenticationPresentationContextProviding {
  private var session: ASWebAuthenticationSession?
  func authenticate(origin: String) async throws -> (ticket: String, verifier: String) {
    let verifier = (UUID().uuidString + UUID().uuidString).replacingOccurrences(of: "-", with: "")
    let challenge = Data(SHA256.hash(data: Data(verifier.utf8))).base64EncodedString()
      .replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_")
      .replacingOccurrences(of: "=", with: "")
    guard var url = URLComponents(string: origin + "/api/sso/start") else {
      throw APIError(status: 0, payload: .strings(["error": "站点地址无效"]))
    }
    url.queryItems = [URLQueryItem(name: "native_challenge", value: challenge)]
    guard let startURL = url.url else { throw APIError(status: 0, payload: .null) }
    let callback: URL = try await withCheckedThrowingContinuation { continuation in
      session = ASWebAuthenticationSession(url: startURL, callbackURLScheme: "sytime") {
        url, error in
        if let url {
          continuation.resume(returning: url)
        } else {
          continuation.resume(throwing: error ?? APIError(status: 0, payload: .null))
        }
      }
      session?.presentationContextProvider = self
      if session?.start() != true {
        continuation.resume(
          throwing: APIError(status: 0, payload: .strings(["error": "无法打开社盟登录，请重试"])))
      }
    }
    session = nil
    let items = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems ?? []
    if let message = items.first(where: { $0.name == "error" })?.value {
      throw APIError(status: 400, payload: .strings(["error": message]))
    }
    guard callback.scheme == "sytime", callback.host == "auth",
      let ticket = items.first(where: { $0.name == "ticket" })?.value, !ticket.isEmpty
    else { throw APIError(status: 400, payload: .strings(["error": "社盟登录回调无效"])) }
    return (ticket, verifier)
  }
  func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
    UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
      .flatMap { $0.windows }.first { $0.isKeyWindow } ?? ASPresentationAnchor()
  }
}
