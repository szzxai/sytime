import SwiftUI

struct InboxView: View {
  @Environment(AppModel.self) private var app
  @State private var rows: [JSONValue] = []
  @State private var filter = "all"
  @State private var more = true
  @State private var loading = false
  @State private var error: String?
  @State private var generation = 0
  var body: some View {
    List {
      Section {
        Picker("消息类型", selection: $filter) {
          Text("全部").tag("all")
          Text("系统").tag("system")
          Text("未读").tag("unread")
        }.pickerStyle(.segmented)
      }
      if rows.isEmpty && !loading && error == nil { EmptyView(title: "暂时没有消息", icon: "bell") }
      ForEach(rows) { row in
        VStack(alignment: .leading, spacing: 10) {
          HStack(alignment: .top) {
            if !row["read"].flag {
              Circle().fill(.tint).frame(width: 8, height: 8).padding(.top, 7).accessibilityLabel(
                "未读")
            }
            Text(row.text("title", "系统消息")).font(.headline)
            if row["important"].flag {
              Image(systemName: "exclamationmark.circle.fill").foregroundStyle(.orange)
                .accessibilityLabel("重要消息")
            }
          }
          Text(row["body"].string).textSelection(.enabled)
          Text(SytimeDate.display(row["created_at"])).font(.caption).foregroundStyle(.secondary)
          HStack {
            if let url = URL(string: row["target"]["url"].string), let route = AppRoute.parse(url) {
              NavigationLink("查看相关内容", value: route)
            } else if !row["target"].isNull {
              Text("相关内容暂不可用").font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            if !row["read"].flag {
              Button("标为已读") { Task { await markRead(row["id"].int) } }.font(.caption)
            }
          }
        }.padding(.vertical, 8)
      }
      if let error {
        Text(error).foregroundStyle(.red)
        Button("重试") { Task { await load(reset: rows.isEmpty) } }
      }
      if more {
        Button(loading ? "正在加载…" : "加载更早消息") { Task { await load(reset: false) } }.disabled(loading)
      }
    }.navigationTitle("消息箱")
      .toolbar {
        ToolbarItem(placement: .topBarTrailing) {
          Button("全部已读") { Task { await markRead(nil) } }.disabled(rows.isEmpty)
        }
      }
      .task(id: "\(app.sessionRevision):\(filter)") { await load(reset: true) }
      .refreshable { await load(reset: true) }
  }
  private func load(reset: Bool) async {
    if loading && !reset { return }
    generation += 1
    let current = generation
    loading = true
    error = nil
    defer { if current == generation { loading = false } }
    var query = ["page_size": "20"]
    if filter == "system" { query["type"] = "system" }
    if filter == "unread" { query["unread"] = "1" }
    if !reset, let last = rows.last { query["before"] = last.id }
    do {
      let data = try await app.api.request(APIClient.path("/api/messages", query: query))
      if Task.isCancelled || current != generation { return }
      let next = data["messages"].array
      rows = reset ? next : rows + next.filter { row in !rows.contains { $0.id == row.id } }
      more = data["has_more"].flag
      app.unreadCount = data["counts"]["all"].int
    } catch {
      if !Task.isCancelled && current == generation { self.error = error.localizedDescription }
    }
  }
  private func markRead(_ id: Int?) async {
    do {
      _ = try await app.api.request(
        id.map { "/api/messages/\($0)/read" } ?? "/api/messages/read-all", method: "PUT")
      await load(reset: true)
      await app.refreshAccount()
    } catch { app.notice = error.localizedDescription }
  }
}

struct SubmissionsView: View {
  @State private var page = 0
  @State private var revision = 0
  @State private var form: FormPresentation?
  var focusedID: Int? = nil
  @State private var showAll = false
  var body: some View {
    APIContent(
      path: APIClient.path(
        "/api/user/submissions",
        query: ["offset": String(page * 20), "id": showAll ? "" : focusedID.map(String.init) ?? ""])
    ) { data in
      List {
        Section {
          Text("资料、评价与店铺均在审核通过后生效。处理结果与说明也会送达消息箱。").font(.footnote).foregroundStyle(.secondary)
        }
        if data["requests"].array.isEmpty { EmptyView(title: "暂无申请") }
        ForEach(data["requests"].array) { row in
          Section {
            HStack {
              Text(kindNames[row["kind"].string] ?? row["kind"].string).font(.headline)
              Spacer()
              Text(statusNames[row["status"].string] ?? row["status"].string).font(.caption)
                .foregroundStyle(row["status"].string == "rejected" ? .red : .secondary)
            }
            Text("#\(row.id) · \(SytimeDate.display(row["created_at"]))").font(.caption)
              .foregroundStyle(.secondary)
            Text(row["summary"].string).textSelection(.enabled)
            if !row["reason"].string.isEmpty { Text("处理说明：\(row["reason"].string)") }
            if !row["reviewed_at"].isNull {
              Text("处理于 \(SytimeDate.display(row["reviewed_at"]))").font(.caption).foregroundStyle(
                .secondary)
            }
            if row["status"].string == "pending" {
              Button("撤回申请", role: .destructive) {
                form = FormPresentation(
                  title: "撤回申请", path: "/api/user/submissions/\(row.id)/withdraw", success: "申请已撤回",
                  confirmation: "确认撤回此申请？")
              }
            }
            if row["status"].string == "approved", let url = URL(string: row["target_url"].string),
              let route = AppRoute.parse(url)
            {
              NavigationLink("查看已发布内容", value: route)
            }
          }
        }
        if focusedID != nil && !showAll {
          Button("查看全部申请") { showAll = true }
        } else {
          Pagination(page: $page, total: data["total"].int)
        }
      }
    }.id(revision).navigationTitle("我的申请")
      .sheet(item: $form) { $0.view { revision += 1 } }
  }
}

struct Pagination: View {
  @Binding var page: Int
  let total: Int
  var size = 20
  var body: some View {
    if total > size {
      HStack {
        Button("上一页") { page -= 1 }.disabled(page == 0)
        Spacer()
        Text("\(page + 1) / \(max(1, (total + size - 1) / size))").font(.caption).foregroundStyle(
          .secondary)
        Spacer()
        Button("下一页") { page += 1 }.disabled((page + 1) * size >= total)
      }
    }
  }
}

struct TicketsView: View {
  @State private var form: FormPresentation?
  @State private var revision = 0
  var body: some View {
    APIContent(path: "/api/tickets/mine") { data in
      List {
        if data["tickets"].array.isEmpty {
          EmptyView(
            title: "还没有工单", description: "遇到问题，或有个新想法？告诉维护团队。",
            icon: "bubble.left.and.text.bubble.right")
        }
        ForEach(data["tickets"].array) { ticket in TicketCard(ticket: ticket) }
      }
    }.id(revision).navigationTitle("问题与建议")
      .toolbar {
        ToolbarItem(placement: .topBarTrailing) {
          Button("新建工单", systemImage: "plus") {
            form = FormPresentation(
              title: "新建工单", path: "/api/tickets",
              fields: [
                FormField("title", "标题", max: 100),
                FormField("content", "详细内容", .multiline, max: 2000),
                FormField(
                  "visibility", "可见范围", .choice([("admin", "管理员及以上"), ("operator", "仅运营者")])),
              ], initial: ["visibility": "admin"], success: "工单已提交，请等待工作人员回复")
          }
        }
      }
      .sheet(item: $form) { $0.view { revision += 1 } }
  }
}
struct TicketCard: View {
  let ticket: JSONValue
  var body: some View {
    Section {
      HStack(alignment: .top) {
        Text(ticket["title"].string).font(.headline)
        Spacer()
        Text(ticket["status"].string == "resolved" ? "已回复" : "待处理").font(.caption).foregroundStyle(
          .secondary)
      }
      Text("#\(ticket.id) · \(ticket["visibility"].string == "operator" ? "仅运营者" : "管理员及以上")").font(
        .caption
      ).foregroundStyle(.secondary)
      Text(ticket["content"].string).textSelection(.enabled)
      Text(SytimeDate.display(ticket["created_at"])).font(.caption).foregroundStyle(.secondary)
      if ticket["status"].string == "resolved" {
        Divider()
        Label("\(ticket["reply_by"].string) 的回复", systemImage: "arrowshape.turn.up.left").font(
          .subheadline.bold())
        Text(ticket["reply_content"].string).textSelection(.enabled)
        Text(SytimeDate.display(ticket["replied_at"])).font(.caption).foregroundStyle(.secondary)
      }
    }
  }
}

struct TitlesView: View {
  @Environment(AppModel.self) private var app
  @State private var revision = 0
  @State private var busy = false
  var body: some View {
    APIContent(path: "/api/user/titles") { data in
      List {
        Section("已获得") {
          Button("不佩戴头衔") { Task { await equip(.null) } }.disabled(busy)
          ForEach(data["titles"].array) { title in
            Button {
              Task { await equip(title["id"]) }
            } label: {
              HStack {
                VStack(alignment: .leading, spacing: 6) {
                  Text(title["name"].string).foregroundStyle(.tint)
                  Text(title["description"].string).font(.caption).foregroundStyle(.secondary)
                  Text(title["source"].string == "auto" ? "自动获得" : "管理员授予").font(.caption2)
                    .foregroundStyle(.secondary)
                }
                Spacer()
                if title["equipped"].flag { Image(systemName: "checkmark.circle.fill") }
              }
            }.disabled(busy)
          }
        }
        Section("继续探索") {
          if data["locked"].array.isEmpty && data["titles"].array.isEmpty {
            Text("还没有头衔，参与校园生活，慢慢点亮成就吧。").foregroundStyle(.secondary)
          }
          ForEach(data["locked"].array) { title in
            VStack(alignment: .leading, spacing: 8) {
              Label(title["name"].string, systemImage: "lock")
              Text(title.text("description", title["rule_label"].string)).font(.caption)
                .foregroundStyle(.secondary)
              ProgressView(
                value: min(title["progress"].double ?? 0, max(1, title["target"].double ?? 1)),
                total: max(1, title["target"].double ?? 1))
              Text("\(title["progress"].string) / \(title["target"].string)").font(.caption)
            }.padding(.vertical, 5)
          }
        }
      }
    }.id(revision).navigationTitle("头衔与成就")
  }
  private func equip(_ id: JSONValue) async {
    guard !busy else { return }
    busy = true
    defer { busy = false }
    do {
      _ = try await app.api.request(
        "/api/user/title", method: "PUT", body: .object(["title_id": id]))
      revision += 1
      await app.refreshAccount()
    } catch { app.notice = error.localizedDescription }
  }
}
struct PublicTitles: View {
  let userID: Int
  var body: some View {
    APIContent(path: "/api/users/\(userID)/titles", authenticated: false) { data in
      if data["titles"].array.isEmpty { Text("暂无公开头衔").foregroundStyle(.secondary) }
      ForEach(data["titles"].array) { Text($0["name"].string) }
    }
  }
}

struct CollectionsView: View {
  @Environment(AppModel.self) private var app
  @State private var form: FormPresentation?
  @State private var revision = 0
  var body: some View {
    APIContent(path: "/api/collections?section=shops") { data in
      List {
        ForEach(data["collections"].array) { collection in
          NavigationLink(value: AppRoute.collection(collection["id"].int, true)) {
            HStack {
              Label(
                collection["name"].string,
                systemImage: collection["is_public"].flag ? "folder" : "lock.rectangle")
              Spacer()
              if data["defaults"]["shops"] == collection["id"] {
                Image(systemName: "star.fill").font(.caption).foregroundStyle(.orange)
              }
              Text("\(collection["items_count"].int)").foregroundStyle(.secondary)
            }
          }
        }
        if data["collections"].array.isEmpty { EmptyView(title: "还没有收藏夹") }
      }
    }.id(revision).navigationTitle("我的收藏")
      .toolbar {
        ToolbarItem(placement: .topBarTrailing) {
          Button("新建收藏夹", systemImage: "folder.badge.plus") { form = newCollectionForm(app) }
        }
      }
      .sheet(item: $form) { $0.view { revision += 1 } }
  }
}
@MainActor func newCollectionForm(_ app: AppModel) -> FormPresentation {
  FormPresentation(
    title: "新建收藏夹", path: "/api/collections",
    fields: [FormField("name", "收藏夹名称", max: 40)]
      + (app.isStudent ? [FormField("is_public", "公开收藏夹", .toggle, required: false)] : []),
    initial: app.isStudent ? ["is_public": app.user.text("collection_default_public", "0")] : [:],
    fixed: ["section": .string("shops"), "is_public": .number(0)], success: "收藏夹已创建")
}
struct PublicCollections: View {
  let userID: Int
  var body: some View {
    APIContent(path: "/api/users/\(userID)/collections", authenticated: false) { data in
      if data["collections"].array.isEmpty { Text("暂无公开收藏夹").foregroundStyle(.secondary) }
      ForEach(data["collections"].array) { row in
        NavigationLink(row["name"].string, value: AppRoute.collection(row["id"].int, false))
      }
    }
  }
}

struct CollectionPicker: View {
  @Environment(AppModel.self) private var app
  @Environment(\.dismiss) private var dismiss
  let shopID: Int
  @State private var form: FormPresentation?
  @State private var revision = 0
  @State private var busy = false
  var body: some View {
    APIContent(path: "/api/collections?section=shops") { data in
      List(data["collections"].array) { row in
        Button {
          Task {
            guard !busy else { return }
            busy = true
            defer { busy = false }
            do {
              let result = try await app.api.request(
                "/api/collections/\(row.id)/items", method: "POST",
                body: .object(["item_type": .string("shop"), "item_id": .number(Double(shopID))]))
              dismiss()
              app.notice = result["added"].flag ? "已加入收藏夹" : "已在收藏夹中"
            } catch { app.notice = error.localizedDescription }
          }
        } label: {
          Label(row["name"].string, systemImage: "folder")
        }.disabled(busy)
      }
    }.id(revision).navigationTitle("加入收藏夹")
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }
        ToolbarItem(placement: .topBarTrailing) { Button("新建") { form = newCollectionForm(app) } }
      }
      .sheet(item: $form) { $0.view { revision += 1 } }
  }
}

struct CollectionDetailView: View {
  @Environment(AppModel.self) private var app
  let id: Int
  let own: Bool
  @State private var page = 0
  @State private var revision = 0
  @State private var form: FormPresentation?
  var body: some View {
    APIContent(path: "/api/collections/\(id)/items?page=\(page + 1)") { data in
      List {
        Section {
          Text(data["collection"]["name"].string).font(.title2.bold())
          Label(
            data["collection"]["is_public"].flag ? "公开收藏夹" : "私密收藏夹",
            systemImage: data["collection"]["is_public"].flag ? "globe" : "lock"
          ).font(.caption).foregroundStyle(.secondary)
        }
        if data["items"].array.isEmpty {
          EmptyView(title: "收藏夹还是空的", description: "在店铺详情点击收藏，保存喜欢的小店。", icon: "bookmark")
        }
        ForEach(data["items"].array) { item in
          Group {
            if item["deleted"].flag {
              Label("店铺已删除", systemImage: "storefront").foregroundStyle(.secondary)
            } else {
              NavigationLink(value: AppRoute.shop(item["item_id"].int)) {
                ShopRow(shop: item["shop"])
              }
            }
          }.swipeActions {
            if own {
              Button("移除", role: .destructive) {
                Task {
                  if await app.act(
                    "/api/collections/\(id)/items/shop/\(item["item_id"].int)", method: "DELETE",
                    success: "已从当前收藏夹移除")
                  {
                    revision += 1
                  }
                }
              }
            }
          }
        }
        Pagination(page: $page, total: data["total"].int)
        if own {
          Section("收藏夹设置") {
            Button("设为默认收藏夹") {
              Task {
                _ = await app.act(
                  "/api/user/settings/collection", method: "PUT",
                  body: .object(["default_collection_shops": .number(Double(id))]))
                await app.refreshAccount()
              }
            }
            Button("重命名") {
              form = FormPresentation(
                title: "重命名收藏夹", path: "/api/collections/\(id)", method: "PUT",
                fields: [FormField("name", "名称", max: 40)],
                initial: ["name": data["collection"]["name"].string])
            }
            if app.isStudent || data["collection"]["is_public"].flag {
              Button(data["collection"]["is_public"].flag ? "改为私密" : "改为公开") {
                form = FormPresentation(
                  title: "修改公开状态", path: "/api/collections/\(id)/public", method: "PUT",
                  fixed: ["is_public": .number(data["collection"]["is_public"].flag ? 0 : 1)],
                  confirmation: data["collection"]["is_public"].flag
                    ? "确认改为私密收藏夹？" : "改为公开后，所有访客都可以在你的主页查看其中的店铺。确认公开？")
              }
            }
          }
        }
      }
    }.id(revision).navigationTitle("收藏夹")
      .sheet(item: $form) { $0.view { revision += 1 } }
  }
}
