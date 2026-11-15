import SwiftUI

struct WikiView: View {
  @Environment(AppModel.self) private var app
  var initialQuery = ""
  @State private var query = ""
  @State private var search = ""
  @State private var folder = ""
  @State private var editing = false
  var body: some View {
    APIContent(
      path: APIClient.path("/api/wiki", query: ["q": search, "folder": folder]),
      authenticated: false
    ) { data in
      List {
        Section {
          Picker("百科目录", selection: $folder) {
            Text("全部分区（\(data["total"].int)）").tag("")
            ForEach(data["folders"].array) { item in
              Text(
                "\(item["parent_id"].isNull ? "" : "　")\(item["name"].string)（\(item["count"].int)）"
              ).tag(item.id)
            }
          }
          Button("随便看看", systemImage: "shuffle") {
            Task {
              do {
                let value = try await app.api.request("/api/wiki/random", authenticated: false)
                app.pendingRoute = .wikiEntry(value["id"].int)
              } catch { app.notice = error.localizedDescription }
            }
          }
        }
        if search.isEmpty && folder.isEmpty {
          Section("最近更新") { ForEach(data["recent"].array) { wikiRow($0) } }
        }
        Section(search.isEmpty ? "公开词条" : "搜索结果") {
          if data["entries"].array.isEmpty {
            Text("此处暂无公开词条。可清除搜索或返回全部分区。").foregroundStyle(.secondary)
          }
          ForEach(data["entries"].array) { wikiRow($0) }
        }
      }
    }.navigationTitle("校园 Wiki").searchable(text: $query, prompt: "标题、别名、内容或拼音")
      .toolbar {
        if app.isStudent { Button("新建词条", systemImage: "square.and.pencil") { editing = true } }
      }
      .sheet(isPresented: $editing) { NavigationStack { WikiEditor(entry: .null) } }
      .task { query = initialQuery }
      .task(id: query) {
        do {
          try await Task.sleep(for: .milliseconds(250))
          search = query
        } catch {}
      }
  }
  private func wikiRow(_ entry: JSONValue) -> some View {
    NavigationLink(value: AppRoute.wikiEntry(entry["id"].int)) {
      VStack(alignment: .leading, spacing: 7) {
        Text(entry["title"].string).font(.headline)
        Text(entry["path"].array.map { $0["name"].string }.joined(separator: " › ")).font(.caption)
          .foregroundStyle(.tint)
        Text(entry["snippet"].string).font(.subheadline).foregroundStyle(.secondary).lineLimit(3)
      }.padding(.vertical, 4)
    }
  }
}

struct WikiEntryView: View {
  @Environment(AppModel.self) private var app
  let id: Int
  @State private var editing = false
  @State private var revision = 0
  var body: some View {
    APIContent(path: "/api/wiki/entries/\(id)") { data in
      let entry = data["entry"]
      ScrollViewReader { reader in
        ScrollView {
          VStack(alignment: .leading, spacing: 22) {
            Text(entry["path"].array.map { $0["name"].string }.joined(separator: " › ")).font(
              .subheadline
            ).foregroundStyle(.tint)
            Text(entry["title"].string).font(.largeTitle.bold())
            if !entry["aliases"].array.isEmpty {
              Text("又称：" + entry["aliases"].array.map(\.string).joined(separator: "、"))
                .foregroundStyle(.secondary)
            }
            Text("更新于 \(SytimeDate.display(entry["updated_at"]))").font(.caption).foregroundStyle(
              .secondary)
            if entry["manual_locked"].flag || entry["auto_locked"].flag {
              Label(
                entry["auto_locked"].flag ? "词条修改正在审核中，暂不可编辑" : entry.text("lock_reason", "词条已锁定"),
                systemImage: "lock"
              ).font(.callout).padding().background(.quaternary, in: .rect(cornerRadius: 14))
            }
            NativeMarkdownView(source: entry["markdown"].string)
            if !entry["sources"].array.isEmpty {
              Divider()
              Text("参考来源").font(.headline)
              ForEach(entry["sources"].array, id: \.self) { source in
                if let url = URL(string: source.string),
                  ["http", "https"].contains(url.scheme ?? "")
                {
                  Link(source.string, destination: url).font(.footnote)
                }
              }
            }
            if !entry["contributors"].array.isEmpty {
              Divider()
              Text("共同编写").font(.headline)
              ForEach(entry["contributors"].array, id: \.self) { person in
                NavigationLink(value: AppRoute.profile(person["user_id"].int)) {
                  PersonLabel(user: person)
                }
              }
            }
            NavigationLink {
              WikiHistoryView(entry: entry)
            } label: {
              Label("修订历史", systemImage: "clock.arrow.circlepath")
            }
            HStack {
              if !data["previous"].isNull {
                NavigationLink(
                  "上一篇 · " + data["previous"]["title"].string,
                  value: AppRoute.wikiEntry(data["previous"]["id"].int))
              }
              Spacer()
              if !data["next"].isNull {
                NavigationLink(
                  "下一篇 · " + data["next"]["title"].string,
                  value: AppRoute.wikiEntry(data["next"]["id"].int))
              }
            }.font(.callout)
            NavigationLink("返回 Wiki 首页", value: AppRoute.wiki(""))
          }.padding(24).frame(maxWidth: 850, alignment: .leading).frame(maxWidth: .infinity)
        }
        .toolbar {
          Menu("本页大纲", systemImage: "list.bullet.indent") {
            ForEach(NativeMarkdown.blocks(entry["markdown"].string)) { block in
              if case .heading = block.kind {
                Button(block.text) {
                  withAnimation { reader.scrollTo("section-\(block.id + 1)", anchor: .top) }
                }
              }
            }
          }
          if app.isStudent && !entry["manual_locked"].flag && !entry["auto_locked"].flag {
            Button("编辑此页", systemImage: "pencil") { editing = true }
          }
          if app.isStaff {
            NavigationLink {
              WikiEntryManagement(entry: entry)
            } label: {
              Label("管理词条", systemImage: "gearshape")
            }
          }
        }
        .sheet(isPresented: $editing, onDismiss: { revision += 1 }) {
          NavigationStack { WikiEditor(entry: entry) }
        }
      }
    }.id(revision).navigationTitle("词条").navigationBarTitleDisplayMode(.inline)
  }
}

struct WikiEditor: View {
  @Environment(AppModel.self) private var app
  @Environment(\.dismiss) private var dismiss
  let entry: JSONValue
  @State private var title = ""
  @State private var folder = ""
  @State private var markdown = ""
  @State private var aliases = ""
  @State private var sources = ""
  @State private var summary = ""
  @State private var images: [JSONValue] = []
  @State private var photo: Data?
  @State private var preview = false
  @State private var saving = false
  @State private var discard = false
  @State private var initialized = false
  @State private var error: String?
  @State private var conflictID: Int?
  @State private var baseRevision: JSONValue = .null
  private var draftKey: String { "wikiDraft:\(app.origin):\(app.user.id):\(entry.id)" }
  private var draft: JSONValue {
    .object([
      "title": .string(title), "folder_id": .string(folder), "markdown": .string(markdown),
      "aliases": .string(aliases), "sources": .string(sources), "summary": .string(summary),
      "images": .array(images), "base_revision_id": baseRevision,
    ])
  }
  var body: some View {
    Form {
      Section {
        Text("内容审核通过后公开。草稿自动保存在当前设备，提交失败时可继续编辑。").font(.footnote).foregroundStyle(.secondary)
      }
      Section("词条信息") {
        TextField("标题", text: $title)
        APIContent(path: "/api/wiki", authenticated: false) { data in
          Picker("归属目录", selection: $folder) {
            Text("请选择").tag("")
            ForEach(data["folders"].array) { Text($0["name"].string).tag($0.id) }
          }
        }
        TextField("别名（每行一个）", text: $aliases, axis: .vertical)
        TextField("编辑摘要", text: $summary, axis: .vertical)
      }
      Section("正文") {
        Toggle("预览排版", isOn: $preview)
        if preview {
          NativeMarkdownView(source: markdown)
        } else {
          TextEditor(text: $markdown).font(.system(.body, design: .monospaced)).frame(
            minHeight: 320
          ).accessibilityLabel("Markdown 正文")
        }
      }
      Section("配图（最多 8 张）") {
        ForEach(images, id: \.self) { image in
          HStack {
            RemotePicture(path: "/api/wiki/images/\(image.string)", fit: true).frame(
              width: 100, height: 80)
            Spacer()
            Button("插入正文") { markdown += "\n\n![](/api/wiki/images/\(image.string))\n" }
            Button("移除", role: .destructive) {
              images.removeAll { $0 == image }
              markdown = markdown.replacingOccurrences(
                of: "![](/api/wiki/images/\(image.string))", with: "")
            }
          }.font(.caption)
        }
        if images.count < 8 {
          PhotoField(data: $photo)
          if photo != nil { Button("上传所选图片") { Task { await upload() } }.disabled(saving) }
        }
      }
      Section("参考来源") {
        TextField("HTTP(S) 链接（每行一个）", text: $sources, axis: .vertical).keyboardType(.URL)
          .textInputAutocapitalization(.never)
      }
      if let error {
        Section {
          Text(error).foregroundStyle(.red)
          if !entry.isNull && baseRevision != entry["current_revision_id"] {
            Button("已对照当前版本完成合并") {
              baseRevision = entry["current_revision_id"]
              self.error = nil
            }
          }
          if let conflictID { NavigationLink("查看已有词条", value: AppRoute.wikiEntry(conflictID)) }
        }
      }
    }.navigationTitle(entry.isNull ? "新建词条" : "编辑词条").navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("关闭") { discard = true }.disabled(saving)
        }
        ToolbarItem(placement: .confirmationAction) {
          Button(saving ? "提交中…" : "提交审核") { Task { await submit() } }.disabled(
            saving || !initialized)
        }
      }.interactiveDismissDisabled()
      .confirmationDialog("离开编辑？草稿会保留在当前设备。", isPresented: $discard, titleVisibility: .visible) {
        Button("保留草稿并离开") {
          persist()
          dismiss()
        }
        Button("删除草稿并离开", role: .destructive) {
          UserDefaults.standard.removeObject(forKey: draftKey)
          dismiss()
        }
      }
      .task {
        guard !initialized else { return }
        if let data = UserDefaults.standard.data(forKey: draftKey),
          let value = try? JSONDecoder().decode(JSONValue.self, from: data)
        {
          title = value["title"].string
          folder = value["folder_id"].string
          markdown = value["markdown"].string
          aliases = value["aliases"].string
          sources = value["sources"].string
          summary = value["summary"].string
          images = value["images"].array
          baseRevision = value["base_revision_id"]
          if !entry.isNull && value["base_revision_id"] != entry["current_revision_id"] {
            error = "草稿基于旧版本，请对照当前词条合并后提交。"
          }
        } else {
          title = entry["title"].string
          folder = entry["folder_id"].string
          markdown = entry["markdown"].string
          aliases = entry["aliases"].array.map(\.string).joined(separator: "\n")
          sources = entry["sources"].array.map(\.string).joined(separator: "\n")
          images = entry["images"].array
          baseRevision = entry["current_revision_id"]
        }
        initialized = true
      }.onChange(of: draft) { _, _ in if initialized { persist() } }
  }
  private func persist() {
    if let data = try? JSONEncoder().encode(draft) {
      UserDefaults.standard.set(data, forKey: draftKey)
    }
  }
  private func lines(_ value: String) -> [JSONValue] {
    value.components(separatedBy: .newlines).map { $0.trimmingCharacters(in: .whitespaces) }.filter
    { !$0.isEmpty }.map(JSONValue.string)
  }
  private func upload() async {
    guard let photo else { return }
    saving = true
    defer { saving = false }
    do {
      let value = try await app.api.upload("/api/wiki/images", fields: [:], image: photo)
      images.append(value["id"])
      self.photo = nil
      markdown += "\n\n![](\(value["url"].string))\n"
    } catch { self.error = error.localizedDescription }
  }
  private func submit() async {
    guard !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
      !markdown.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, let folderID = Int(folder),
      entry.isNull || !summary.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    else {
      error = "请填写标题、归属目录、正文和编辑摘要。"
      return
    }
    saving = true
    error = nil
    defer { saving = false }
    do {
      let body: JSONValue = .object([
        "title": .string(title), "folder_id": .number(Double(folderID)),
        "markdown": .string(markdown), "aliases": .array(lines(aliases)),
        "sources": .array(lines(sources)), "summary": .string(summary), "images": .array(images),
        "base_revision_id": baseRevision,
      ])
      _ = try await app.api.request(
        entry.isNull ? "/api/wiki/entries" : "/api/wiki/entries/\(entry.id)/submissions",
        method: "POST", body: body)
      UserDefaults.standard.removeObject(forKey: draftKey)
      app.notice = entry.isNull ? "词条已提交审核" : "词条修改已提交审核"
      dismiss()
    } catch {
      self.error = error.localizedDescription
      conflictID = (error as? APIError)?.payload["entry_id"].double.map(Int.init)
      persist()
    }
  }
}

struct WikiHistoryView: View {
  let entry: JSONValue
  var body: some View {
    APIContent(path: "/api/wiki/entries/\(entry.id)/history", authenticated: false) { data in
      List {
        ForEach(Array(data["revisions"].array.enumerated()), id: \.element.id) { index, row in
          NavigationLink {
            WikiRevisionView(
              entry: entry, revisionID: row["id"].int,
              previousID: data["revisions"].array.dropFirst(index + 1).first?["id"].int)
          } label: {
            VStack(alignment: .leading, spacing: 8) {
              Text(row["summary"].string).font(.headline)
              PersonLabel(user: row)
              Text(SytimeDate.display(row["created_at"])).font(.caption).foregroundStyle(.secondary)
            }
          }
        }
      }
    }.navigationTitle("修订历史")
  }
}

struct WikiRevisionView: View {
  @Environment(AppModel.self) private var app
  let entry: JSONValue
  let revisionID: Int
  var previousID: Int?
  @State private var diff = false
  @State private var form: FormPresentation?
  var body: some View {
    APIContent(path: "/api/wiki/entries/\(entry.id)/revisions/\(revisionID)", authenticated: false)
    { data in
      ScrollView {
        VStack(alignment: .leading, spacing: 20) {
          Text(data["revision"]["title"].string).font(.title.bold())
          Text(data["revision"]["summary"].string).foregroundStyle(.secondary)
          if let previousID {
            Toggle("与上一版比较", isOn: $diff)
            if diff {
              APIContent(
                path: "/api/wiki/entries/\(entry.id)/revisions/\(previousID)", authenticated: false
              ) { old in
                NativeTextDiff(
                  before: old["revision"]["markdown"].string,
                  after: data["revision"]["markdown"].string)
              }
            }
          }
          if !diff { NativeMarkdownView(source: data["revision"]["markdown"].string) }
          if app.isStaff {
            Button("回滚至此版本") {
              form = FormPresentation(
                title: "回滚词条", path: "/api/admin/wiki/entries/\(entry.id)/rollback",
                fixed: ["revision_id": .number(Double(revisionID))],
                confirmation: "确认使用此历史版本作为新的公开版本？")
            }
            if entry["current_revision_id"].int != revisionID {
              Button("隐藏此历史版本", role: .destructive) {
                form = FormPresentation(
                  title: "隐藏历史版本",
                  path: "/api/admin/wiki/entries/\(entry.id)/revisions/\(revisionID)/hide",
                  confirmation: "确认隐藏这份历史快照？")
              }
            }
          }
        }.padding().frame(maxWidth: 850, alignment: .leading).frame(maxWidth: .infinity)
      }
    }.navigationTitle("版本 #\(revisionID)").sheet(item: $form) { $0.view {} }
  }
}

struct WikiEntryManagement: View {
  @Environment(AppModel.self) private var app
  let entry: JSONValue
  @State private var folder = ""
  @State private var position = "0"
  @State private var reason = ""
  @State private var locked = false
  @State private var deleting = false
  var body: some View {
    Form {
      APIContent(path: "/api/wiki", authenticated: false) { data in
        Picker("归属目录", selection: $folder) {
          ForEach(data["folders"].array) { Text($0["name"].string).tag($0.id) }
        }
      }
      TextField("排列顺序", text: $position).keyboardType(.numbersAndPunctuation)
      Toggle("手动锁定", isOn: $locked)
      TextField("锁定说明", text: $reason)
      Button("保存管理设置") {
        Task {
          guard let f = Double(folder), let p = Double(position) else { return }
          _ = await app.act(
            "/api/admin/wiki/entries/\(entry.id)", method: "PUT",
            body: .object([
              "folder_id": .number(f), "position": .number(p), "manual_locked": .bool(locked),
              "lock_reason": .string(reason),
            ]))
        }
      }
      Button("删除词条", role: .destructive) { deleting = true }
    }.navigationTitle("管理词条").task {
      folder = entry["folder_id"].string
      position = entry["position"].string
      locked = entry["manual_locked"].flag
      reason = entry["lock_reason"].string
    }
    .confirmationDialog("确认删除词条并使待审核申请失效？", isPresented: $deleting, titleVisibility: .visible) {
      Button("删除词条", role: .destructive) {
        Task { _ = await app.act("/api/admin/wiki/entries/\(entry.id)", method: "DELETE") }
      }
    }
  }
}

struct WikiFolderManagement: View {
  @State private var form: FormPresentation?
  @State private var revision = 0
  var body: some View {
    APIContent(path: "/api/wiki", authenticated: false) { data in
      List {
        Button("新建目录", systemImage: "folder.badge.plus") {
          form = folderForm(.null, folders: data["folders"].array)
        }
        ForEach(data["folders"].array) { folder in
          Button("\(folder["parent_id"].isNull ? "" : "　")\(folder["name"].string)") {
            form = folderForm(folder, folders: data["folders"].array)
          }
          .swipeActions {
            Button("删除", role: .destructive) {
              form = FormPresentation(
                title: "删除目录", path: "/api/admin/wiki/folders/\(folder.id)", method: "DELETE",
                confirmation: "确认删除空目录？含有词条或待审核内容的目录无法删除。")
            }
          }
        }
      }
    }.id(revision).navigationTitle("Wiki 目录管理").sheet(item: $form) { $0.view { revision += 1 } }
  }
  private func folderForm(_ folder: JSONValue, folders: [JSONValue]) -> FormPresentation {
    FormPresentation(
      title: folder.isNull ? "新建目录" : "编辑目录",
      path: "/api/admin/wiki/folders" + (folder.isNull ? "" : "/\(folder.id)"),
      method: folder.isNull ? "POST" : "PUT",
      fields: [
        FormField("name", "目录名称", max: 80),
        FormField(
          "parent_id", "上级目录",
          .choice(
            [("0", "一级目录")]
              + folders.filter { $0["parent_id"].isNull && $0.id != folder.id }.map {
                ($0.id, $0["name"].string)
              })), FormField("position", "排列顺序", .integer),
      ],
      initial: [
        "name": folder["name"].string,
        "parent_id": folder["parent_id"].isNull ? "0" : folder["parent_id"].string,
        "position": folder.text("position", "0"),
      ])
  }
}
