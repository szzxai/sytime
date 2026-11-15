import SwiftUI

struct AdminView: View {
  var body: some View {
    List {
      Section("工作台") {
        NavigationLink {
          AdminOverviewView()
        } label: {
          Label("工作概览", systemImage: "chart.bar.xaxis")
        }
        NavigationLink {
          AdminReviewsView()
        } label: {
          Label("审核中心", systemImage: "checkmark.seal")
        }
        NavigationLink {
          AdminUsersView()
        } label: {
          Label("用户管理", systemImage: "person.2")
        }
        NavigationLink {
          AdminTicketsView()
        } label: {
          Label("工单处理", systemImage: "bubble.left.and.text.bubble.right")
        }
      }
      Section("站点运营") {
        NavigationLink {
          WikiFolderManagement()
        } label: {
          Label("Wiki 目录管理", systemImage: "folder")
        }
        NavigationLink {
          AdminContentView()
        } label: {
          Label("站点内容", systemImage: "megaphone")
        }
        NavigationLink {
          AdminTitlesView()
        } label: {
          Label("头衔管理", systemImage: "medal")
        }
        NavigationLink {
          AdminAuditView()
        } label: {
          Label("操作记录", systemImage: "clock.arrow.circlepath")
        }
      }
    }.navigationTitle("审核与运营")
  }
}

struct AdminOverviewView: View {
  var body: some View {
    APIContent(path: "/api/admin/overview") { data in
      List {
        Section("工作概览") {
          LabeledContent("待审核申请", value: data["pending"].string)
          LabeledContent("待处理工单", value: data["tickets"].string)
          LabeledContent("今日已处理", value: data["reviewed_today"].string)
          LabeledContent("社区账号", value: data["users"].string)
        }
        Section("待办分布") {
          if data["counts"].array.isEmpty { Label("所有待办都处理完了", systemImage: "checkmark.circle") }
          ForEach(data["counts"].array, id: \.self) { row in
            NavigationLink {
              AdminReviewsView(initialKind: row["kind"].string)
            } label: {
              LabeledContent(
                kindNames[row["kind"].string] ?? row["kind"].string, value: row["count"].string)
            }
          }
        }
      }
    }.navigationTitle("工作概览")
  }
}

struct AdminReviewsView: View {
  var initialKind = ""
  @State private var kind = ""
  @State private var status = "pending"
  @State private var page = 0
  var body: some View {
    APIContent(
      path: APIClient.path(
        "/api/admin/reviews", query: ["kind": kind, "status": status, "offset": String(page * 20)])
    ) { data in
      List {
        Section("筛选") {
          Picker("申请类型", selection: $kind) {
            Text("全部类型").tag("")
            ForEach(kindNames.keys.sorted(), id: \.self) { Text(kindNames[$0] ?? $0).tag($0) }
          }
          Picker("状态", selection: $status) {
            ForEach(["pending", "approved", "rejected", "withdrawn"], id: \.self) {
              Text(statusNames[$0] ?? $0).tag($0)
            }
          }
        }
        if data["requests"].array.isEmpty { EmptyView(title: "暂无相关申请", icon: "checkmark.seal") }
        ForEach(data["requests"].array) { row in
          NavigationLink {
            AdminReviewDetailView(id: row["id"].int)
          } label: {
            VStack(alignment: .leading, spacing: 7) {
              Text("\(kindNames[row["kind"].string] ?? row["kind"].string) · #\(row.id)").font(
                .headline)
              Text(
                "\(row.text("nickname", row["username"].string)) · \(SytimeDate.display(row["created_at"]))"
              ).font(.caption).foregroundStyle(.secondary)
              Text(statusNames[row["status"].string] ?? "").font(.caption).foregroundStyle(.tint)
            }.padding(.vertical, 5)
          }
        }
        Pagination(page: $page, total: data["total"].int)
      }
    }.navigationTitle("审核中心")
      .onChange(of: kind) { _, _ in page = 0 }.onChange(of: status) { _, _ in page = 0 }
      .task { kind = initialKind }
  }
}

struct AdminReviewDetailView: View {
  @Environment(AppModel.self) private var app
  let id: Int
  @State private var form: FormPresentation?
  @State private var revision = 0
  var body: some View {
    APIContent(path: "/api/admin/reviews/\(id)") { data in
      let request = data["request"]
      List {
        Section("申请资料") {
          LabeledContent("类型", value: kindNames[request["kind"].string] ?? request["kind"].string)
          LabeledContent("申请人", value: request.text("nickname", request["username"].string))
          LabeledContent("提交时间", value: SytimeDate.display(request["created_at"]))
          LabeledContent("状态", value: statusNames[request["status"].string] ?? "")
        }
        Section("申请内容 · 审核前保密") { ModerationPayloadView(payload: request["payload"]) }
        if request["status"].string == "pending" {
          Section("处理决定") {
            if request["user_id"] == app.user["id"] {
              Text("不能审核自己的申请").foregroundStyle(.secondary)
            } else {
              Button("通过申请") {
                form = FormPresentation(
                  title: "通过申请", path: "/api/admin/reviews/\(id)/decision",
                  fixed: ["decision": .string("approve")], success: "申请已通过并通知申请人",
                  confirmation: "通过后立即生效并通知申请人。请确认已核对申请内容。")
              }
              Button("拒绝申请", role: .destructive) {
                form = FormPresentation(
                  title: "拒绝申请", path: "/api/admin/reviews/\(id)/decision",
                  fields: [FormField("reason", "处理说明（必填）", .multiline, max: 500)],
                  fixed: ["decision": .string("reject")], success: "已拒绝并通知申请人",
                  confirmation: "确认拒绝这份申请并发送处理说明？")
              }
            }
          }
        } else {
          Section("处理结果") {
            Text(request.text("reason", "无补充说明"))
            LabeledContent("处理时间", value: SytimeDate.display(request["reviewed_at"]))
            LabeledContent("审核人编号", value: request["reviewer_id"].string)
          }
        }
      }
    }.id(revision).navigationTitle("申请 #\(id)")
      .sheet(item: $form) { $0.view { revision += 1 } }
  }
}

struct ModerationPayloadView: View {
  let payload: JSONValue
  private let labels = [
    "value": "新内容",
    "extra_info": "补充信息", "dish_id": "菜品编号", "shop_id": "店铺编号", "name": "名称", "rating": "评分",
    "comment": "评价", "content": "内容", "guests": "用餐人数", "total_price": "总价", "remove_image": "移除旧图",
    "appeal_reason": "申诉理由", "address": "地址", "type": "类型", "lat": "纬度 GCJ-02", "lng": "经度 GCJ-02",
    "campus_distance_m": "校园距离（米）", "campus_walk_min": "校园步行时间（分）", "metro_station": "地铁站",
    "metro_exit": "地铁出口", "metro_distance_m": "地铁距离（米）", "metro_walk_min": "地铁步行时间（分）",
    "location_note": "位置说明", "dianping_url": "点评链接",
  ]
  var body: some View {
    ForEach(payload.object.keys.sorted(), id: \.self) { key in
      let value = payload[key]
      if key == "image_data" || key == "image_url" {
        if !value.string.isEmpty {
          RemotePicture(path: value.string, fit: true, label: "待审核图片").frame(maxHeight: 360)
        }
      } else if key == "markdown" {
        NativeMarkdownView(source: value.string)
        if !payload["before_markdown"].isNull {
          NativeTextDiff(before: payload["before_markdown"].string, after: value.string)
        }
      } else if key == "before_markdown" {
        Text("原文在上方差异对比中展示").font(.caption).foregroundStyle(.secondary)
      } else if key == "images" {
        ForEach(value.array, id: \.self) { image in
          RemotePicture(path: "/api/wiki/images/\(image.string)", fit: true).frame(maxHeight: 300)
        }
      } else if case .array = value {
        VStack(alignment: .leading) {
          Text(labels[key] ?? key).font(.caption).foregroundStyle(.secondary)
          ForEach(value.array, id: \.self) { Text($0.string) }
        }
      } else if !value.isNull {
        VStack(alignment: .leading, spacing: 6) {
          Text(labels[key] ?? key).font(.caption).foregroundStyle(.secondary)
          Text(value.string.isEmpty ? "无" : value.string).textSelection(.enabled)
        }
      }
    }
  }
}

struct AdminUsersView: View {
  @State private var search = ""
  @State private var effective = ""
  @State private var page = 0
  var body: some View {
    APIContent(
      path: APIClient.path(
        "/api/admin/users", query: ["search": effective, "offset": String(page * 20)])
    ) { data in
      List {
        if data["users"].array.isEmpty {
          EmptyView(title: "没有匹配账号", icon: "person.crop.circle.badge.questionmark")
        }
        ForEach(data["users"].array) { user in
          NavigationLink {
            AdminUserDetailView(initial: user)
          } label: {
            VStack(alignment: .leading, spacing: 7) {
              PersonLabel(user: user)
              Text(
                "@\(user["username"].string) · ID \(user["display_id"].string) · \(statusNames[user["status"].string] ?? "")"
              ).font(.caption).foregroundStyle(.secondary)
            }
          }
        }
        Pagination(page: $page, total: data["total"].int)
      }
    }.navigationTitle("用户管理").searchable(text: $search, prompt: "用户名、昵称或展示 ID")
      .task(id: search) {
        do {
          try await Task.sleep(for: .milliseconds(250))
          effective = search
          page = 0
        } catch {}
      }
  }
}

struct AdminUserDetailView: View {
  @Environment(AppModel.self) private var app
  let initial: JSONValue
  @State private var form: FormPresentation?
  @State private var revision = 0
  private var id: Int { initial["id"].int }
  private func canManage(_ user: JSONValue) -> Bool {
    let weights = ["user": 1, "student": 2, "admin": 3, "operator": 4]
    return id != app.user["id"].int
      && (weights[app.user["role"].string] ?? 0) > (weights[user["role"].string] ?? 9)
  }
  var body: some View {
    APIContent(path: "/api/admin/users/\(id)") { data in
      let user = data["user"]
      List {
        Section {
          PersonLabel(user: user)
          LabeledContent("账号状态", value: statusNames[user["status"].string] ?? "")
          LabeledContent("展示 ID", value: user["display_id"].string)
        }
        if canManage(user) {
          Section("账号操作") {
            if user["status"].string == "banned" {
              Button("解封账号") {
                form = FormPresentation(
                  title: "解封账号", path: "/api/admin/users/unban", method: "PUT",
                  fields: [FormField("reason", "处理说明", .multiline, max: 500)],
                  fixed: ["userId": .number(Double(id))], confirmation: "确认解封账号？之前的申请不会自动恢复。")
              }
            } else {
              Button("封禁账号", role: .destructive) {
                form = FormPresentation(
                  title: "封禁账号", path: "/api/admin/users/ban", method: "PUT",
                  fields: [
                    FormField("ban_reason", "封禁原因", .multiline, max: 500),
                    FormField("allow_appeal", "允许在线申诉", .toggle, required: false),
                  ], initial: ["allow_appeal": "1"], fixed: ["userId": .number(Double(id))],
                  confirmation: "确认封禁？账号将立即失去登录资格，所有会话失效。")
              }
            }
            if app.user["role"].string == "operator" && user["auth_source"].string != "sso" {
              Button(user["role"].string == "admin" ? "撤销管理员" : "任命管理员") {
                form = FormPresentation(
                  title: "修改管理员身份", path: "/api/admin/users/role", method: "PUT",
                  fixed: [
                    "userId": .number(Double(id)),
                    "newRole": .string(user["role"].string == "admin" ? "user" : "admin"),
                  ], confirmation: "确认修改账号角色？该账号所有设备的会话将失效。")
              }
            }
            NavigationLink {
              AdminUserTitlesView(userID: id)
            } label: {
              Text("授予与撤销头衔")
            }
          }
        } else {
          Section { Text("不能管理自己、同级或更高权限的账号。").foregroundStyle(.secondary) }
        }
      }
    }.id(revision).navigationTitle("账号详情")
      .sheet(item: $form) { $0.view { revision += 1 } }
  }
}

struct AdminTicketsView: View {
  @Environment(AppModel.self) private var app
  @State private var form: FormPresentation?
  @State private var revision = 0
  var body: some View {
    APIContent(path: "/api/admin/tickets") { data in
      List {
        if data["tickets"].array.isEmpty { EmptyView(title: "没有待处理工单", icon: "bubble.left") }
        ForEach(data["tickets"].array) { ticket in
          TicketCard(ticket: ticket)
          if ticket["status"].string == "pending" && ticket["user_id"] != app.user["id"] {
            Section {
              Button("回复工单 #\(ticket.id)") {
                form = FormPresentation(
                  title: "回复工单", path: "/api/admin/tickets/reply", method: "PUT",
                  fields: [FormField("reply", "回复内容", .multiline, max: 2000)],
                  fixed: ["id": ticket["id"]], success: "回复已提交并通知用户",
                  confirmation: "确认发送回复？发送后不能修改。")
              }
            }
          }
        }
      }
    }.id(revision).navigationTitle("工单处理")
      .sheet(item: $form) { $0.view { revision += 1 } }
  }
}

struct AdminContentView: View {
  @State private var form: FormPresentation?
  @State private var revision = 0
  var body: some View {
    List {
      Section("站点横幅") {
        APIContent(path: "/api/settings/banner") { data in
          Text(data.text("banner", "当前无横幅")).foregroundStyle(.secondary)
          Button("编辑横幅") {
            form = FormPresentation(
              title: "站点横幅", path: "/api/admin/settings/banner", method: "PUT",
              fields: [FormField("banner", "提示正文（留空关闭横幅）", .multiline, required: false)],
              initial: ["banner": data["banner"].string], confirmation: "横幅将向全站访客展示。确认发布？")
          }
        }
      }
      Section("公告与通知") {
        Button("发布更新公告") {
          form = FormPresentation(
            title: "发布公告", path: "/api/admin/announcements",
            fields: [FormField("title", "标题", max: 100), FormField("content", "公告正文", .multiline)],
            confirmation: "确认将此公告发布到公开列表？")
        }
        Button("发送站内系统通知") {
          form = FormPresentation(
            title: "系统通知", path: "/api/admin/notifications",
            fields: [
              FormField("title", "标题", max: 100), FormField("body", "通知正文", .multiline),
              FormField("important", "标为重要", .toggle, required: false),
            ], initial: ["important": "0"], confirmation: "将向全部账号发送系统通知。确认发送？")
        }
      }
      Section("已发布公告") {
        APIContent(path: "/api/announcements") { data in
          if data["announcements"].array.isEmpty { Text("暂无公告").foregroundStyle(.secondary) }
          ForEach(data["announcements"].array) { row in
            VStack(alignment: .leading, spacing: 8) {
              Text(row["title"].string).font(.headline)
              Text(row["content"].string).lineLimit(3).foregroundStyle(.secondary)
              Button("删除公告", role: .destructive) {
                form = FormPresentation(
                  title: "删除公告", path: "/api/admin/announcements/\(row.id)", method: "DELETE",
                  confirmation: "确认删除这条公开公告？")
              }
            }
          }
        }
      }
    }.id(revision).navigationTitle("站点内容")
      .sheet(item: $form) { $0.view { revision += 1 } }
  }
}

let titleHueOptions = [
  ("teal", "黛青"), ("vermilion", "朱印"), ("ochre", "赭石"), ("bamboo", "竹青"), ("wisteria", "紫藤"),
  ("indigo", "靛蓝"), ("rose", "绛红"), ("stone", "石灰"),
]
func titleFields() -> [FormField] {
  [
    FormField("name", "头衔名称", max: 20), FormField("hue", "颜色", .choice(titleHueOptions)),
    FormField("description", "说明", .multiline, required: false, max: 200),
  ]
}

struct AdminTitlesView: View {
  @State private var form: FormPresentation?
  @State private var revision = 0
  var body: some View {
    APIContent(path: "/api/admin/titles") { data in
      List {
        Section {
          NavigationLink {
            NewTitleView()
          } label: {
            Label("新建头衔", systemImage: "plus")
          }
        }
        ForEach(data["titles"].array) { title in
          Section {
            Text(title["name"].string).font(.headline)
            Text(title["description"].string).foregroundStyle(.secondary)
            Text(title["source"].string == "auto" ? "自动获得 · \(title["rule"].string)" : "手动授予").font(
              .caption
            ).foregroundStyle(.secondary)
            Button("编辑头衔") {
              form = FormPresentation(
                title: "编辑头衔", path: "/api/admin/titles/\(title.id)", method: "PUT",
                fields: titleFields(),
                initial: [
                  "name": title["name"].string, "hue": title["hue"].string,
                  "description": title["description"].string,
                ])
            }
            if title["key"].string.isEmpty {
              Button("删除头衔", role: .destructive) {
                form = FormPresentation(
                  title: "删除头衔", path: "/api/admin/titles/\(title.id)", method: "DELETE",
                  confirmation: "确认删除头衔并从已拥有的账号中移除？")
              }
            }
          }
        }
      }
    }.id(revision).navigationTitle("头衔管理")
      .sheet(item: $form) { $0.view { revision += 1 } }
  }
}
struct NewTitleView: View {
  var body: some View {
    APIContent(path: "/api/admin/titles/rules") { data in
      NativeForm(
        title: "新建头衔", path: "/api/admin/titles",
        fields: titleFields() + [
          FormField("source", "发放方式", .choice([("grant", "手动授予"), ("auto", "自动获得")])),
          FormField(
            "rule", "自动规则",
            .choice(
              [("", "手动头衔无需规则")]
                + data["rules"].array.map { ($0["key"].string, $0["label"].string) }),
            required: false),
        ], initial: ["hue": "teal", "source": "grant", "rule": ""],
        explanation: "自动头衔需选择规则，不能手动授予或撤销。")
    }
  }
}

struct AdminUserTitlesView: View {
  let userID: Int
  @State private var form: FormPresentation?
  @State private var revision = 0
  var body: some View {
    APIContent(path: "/api/admin/users/\(userID)") { data in
      List {
        Section("已拥有") {
          if data["user"]["titles"].array.isEmpty { Text("尚无头衔").foregroundStyle(.secondary) }
          ForEach(data["user"]["titles"].array) { title in
            VStack(alignment: .leading, spacing: 8) {
              Text(title["name"].string)
              if title["source"].string != "auto" {
                Button("撤销头衔", role: .destructive) {
                  form = FormPresentation(
                    title: "撤销头衔", path: "/api/admin/users/\(userID)/titles/\(title.id)",
                    method: "DELETE", confirmation: "确认撤销此头衔？当前佩戴状态将同步清除。")
                }
              }
            }
          }
        }
        Section("授予头衔") {
          APIContent(path: "/api/admin/titles") { catalog in
            ForEach(
              catalog["titles"].array.filter { row in
                row["source"].string != "auto"
                  && !data["user"]["titles"].array.contains { $0["id"] == row["id"] }
              }
            ) { title in
              Button("授予「\(title["name"].string)」") {
                form = FormPresentation(
                  title: "授予头衔", path: "/api/admin/users/\(userID)/titles",
                  fixed: ["title_id": title["id"]], confirmation: "确认向此账号授予头衔？")
              }
            }
          }
          Button("创建账号专属头衔") {
            form = FormPresentation(
              title: "专属头衔", path: "/api/admin/users/\(userID)/titles/custom",
              fields: titleFields(), initial: ["hue": "teal"], confirmation: "确认创建并授予此账号专属头衔？")
          }
        }
      }
    }.id(revision).navigationTitle("账号头衔")
      .sheet(item: $form) { $0.view { revision += 1 } }
  }
}

struct AdminAuditView: View {
  @State private var page = 0
  var body: some View {
    APIContent(path: "/api/admin/audit?offset=\(page * 20)") { data in
      List {
        ForEach(data["events"].array) { event in
          VStack(alignment: .leading, spacing: 8) {
            Text(event["action"].string).font(.headline)
            Text(
              "操作者：\(event.text("actor_name", "系统")) · 目标：\(event.text("target_name", event["target_id"].string))"
            ).font(.subheadline)
            if !event["detail"].string.isEmpty {
              Text(event["detail"].string).font(.caption).textSelection(.enabled)
            }
            Text(SytimeDate.display(event["created_at"])).font(.caption).foregroundStyle(.secondary)
          }.padding(.vertical, 4)
        }
        Pagination(page: $page, total: data["total"].int)
      }
    }.navigationTitle("操作记录")
  }
}
