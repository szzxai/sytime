import SwiftUI

enum FoodMode: String, CaseIterable {
  case daily = "今日与明日"
  case weekly = "每周食谱"
  case all = "全部菜品"
  case reviews = "大家的评价"
}

struct FoodView: View {
  @Environment(AppModel.self) private var app
  @Environment(\.scenePhase) private var scenePhase
  @State private var mode = FoodMode.daily
  @State private var query = ""
  @State private var date = Date()
  @State private var campus = "main"
  @State private var firstMeal = "noon"
  @State private var nextMeal = "noon"
  @State private var source = ""
  @State private var day = ""
  @State private var place = ""
  @State private var meal = ""
  @State private var category = ""
  @State private var spicy = ""
  @State private var rating = ""
  @State private var minPrice = ""
  @State private var maxPrice = ""
  @State private var filters = false
  @State private var resource = Resource()
  @State private var appliedPreference = false
  private var menuPath: String {
    APIClient.path(
      "/api/menu",
      query: mode == .daily || (mode == .all && source.isEmpty)
        ? ["all": "1"] : ["source_id": source])
  }
  var body: some View {
    Group {
      if mode == .reviews {
        APIContent(path: "/api/recipes", authenticated: false) { data in
          List {
            if data["recipes"].array.isEmpty {
              EmptyView(title: "还没有评价", description: "去菜品详情分享你的用餐感受吧。", icon: "text.bubble")
            }
            ForEach(data["recipes"].array) { row in
              VStack(alignment: .leading) {
                if row["dish_id"].int > 0 {
                  NavigationLink(row.text("name", "菜品详情"), value: AppRoute.dish(row["dish_id"].int))
                    .font(.headline)
                }
                ReviewCard(review: row)
              }
            }
          }
        }
      } else if resource.value.isNull {
        if let error = resource.error {
          FailureView(message: error) { await load() }
        } else {
          ProgressView("正在查看食谱…").frame(maxWidth: .infinity, maxHeight: .infinity)
        }
      } else {
        ScrollView {
          VStack(alignment: .leading, spacing: 22) {
            if let error = resource.error { RetryBanner(message: error) { await load() } }
            if mode == .daily {
              HStack {
                DatePicker("供应日期", selection: $date, displayedComponents: .date).labelsHidden()
                  .environment(\.timeZone, SytimeDate.timeZone)
                Spacer()
                Picker("校区", selection: $campus) {
                  Text("本部校区").tag("main")
                  Text("正谊校区").tag("zhengyi")
                }.pickerStyle(.menu)
              }
              ViewThatFits(in: .horizontal) {
                HStack(alignment: .top, spacing: 20) {
                  dailyColumn(title: "今天我吃了…", day: SytimeDate.day(date), selection: $firstMeal)
                    .frame(minWidth: 330)
                  dailyColumn(
                    title: "明天吃什么？", day: SytimeDate.shifted(SytimeDate.day(date), by: 1),
                    selection: $nextMeal
                  ).frame(minWidth: 330)
                }
                VStack(alignment: .leading, spacing: 30) {
                  dailyColumn(title: "今天我吃了…", day: SytimeDate.day(date), selection: $firstMeal)
                  dailyColumn(
                    title: "明天吃什么？", day: SytimeDate.shifted(SytimeDate.day(date), by: 1),
                    selection: $nextMeal)
                }
              }
            } else {
              Picker("食谱周次", selection: $source) {
                if mode == .all { Text("全部周次").tag("") } else { Text("最近一周").tag("") }
                ForEach(resource.value["weeks"].array) { week in
                  Text("\(week["start_date"].string) — \(week["end_date"].string)").tag(week.id)
                }
              }.pickerStyle(.menu)
              if mode == .weekly {
                ScrollView(.horizontal) {
                  HStack {
                    ForEach(days, id: \.self) { d in
                      Button {
                        day = d
                      } label: {
                        Text(d == SytimeDate.day() ? "今天 · \(d.suffix(5))" : String(d.suffix(5)))
                          .padding(.horizontal, 12).padding(.vertical, 9).background(
                            day == d
                              ? Color.accentColor.opacity(0.18)
                              : Color(.secondarySystemGroupedBackground), in: .capsule)
                      }.buttonStyle(.plain)
                    }
                  }
                }.scrollIndicators(.hidden)
              }
              if ["failed", "partial", "interrupted"].contains(
                resource.value["sync"]["status"].string)
              {
                Label("最近一次更新未完成，正在展示上次成功整理的食谱。", systemImage: "clock.arrow.circlepath").font(
                  .footnote
                ).foregroundStyle(.secondary)
              }
              if resource.value["weeks"].array.isEmpty {
                EmptyView(title: "食谱正在等候更新", description: "学校发布食谱后会自动整理。", icon: "fork.knife")
              } else if filtered.isEmpty {
                EmptyView(title: "没有匹配的菜品", description: "试试其他日期、地点或筛选条件。", icon: "fork.knife")
                Button("清除筛选") { clearFilters() }
              } else if mode == .weekly {
                ForEach(groupKeys, id: \.self) { key in
                  VStack(alignment: .leading, spacing: 12) {
                    Text(key).font(.headline)
                    supplyGrid(grouped[key] ?? [])
                  }
                }
              } else {
                supplyGrid(uniqueDishes(filtered))
              }
              Text("\(filtered.count) 条供应 · 供应以食堂实际安排为准").font(.caption).foregroundStyle(.secondary)
            }
          }.padding(20).frame(maxWidth: 1250, alignment: .leading).frame(maxWidth: .infinity)
        }.refreshable { await load() }
      }
    }
    .background(Color(.systemGroupedBackground))
    .navigationTitle("菜品与食谱")
    .searchable(text: $query, prompt: "菜名、拼音或首字母")
    .onChange(of: mode) { _, _ in day = "" }
    .toolbar {
      ToolbarItem(placement: .topBarLeading) {
        Menu {
          Picker("食谱视图", selection: $mode) {
            ForEach(FoodMode.allCases, id: \.self) { Text($0.rawValue).tag($0) }
          }
        } label: {
          Label(mode.rawValue, systemImage: "rectangle.split.2x1")
        }
      }
      if mode == .weekly || mode == .all {
        ToolbarItem(placement: .topBarTrailing) {
          Button("筛选", systemImage: "line.3.horizontal.decrease") { filters = true }
        }
      }
    }
    .sheet(isPresented: $filters) {
      NavigationStack {
        filterForm.navigationTitle("筛选菜品").toolbar {
          ToolbarItem(placement: .cancellationAction) { Button("清除") { clearFilters() } }
          ToolbarItem(placement: .confirmationAction) { Button("完成") { filters = false } }
        }
      }.presentationDetents([.large])
    }
    .task(id: "\(app.sessionRevision):\(menuPath)") {
      if !appliedPreference && !app.user.isNull {
        appliedPreference = true
        mode =
          ["weekly": FoodMode.weekly, "all": .all, "reviews": .reviews][
            app.user["recipe_default_view"].string] ?? .daily
      }
      await load()
    }
    .task {
      while !Task.isCancelled {
        try? await Task.sleep(for: .seconds(60))
        if Task.isCancelled { break }
        if scenePhase == .active { await load() }
      }
    }
  }
  private var records: [JSONValue] { resource.value["records"].array }
  private var days: [String] { Array(Set(records.map { $0["date"].string })).sorted() }
  private var filtered: [JSONValue] {
    records.filter { row in
      (day.isEmpty || row["date"].string == day) && (place.isEmpty || row["place"].string == place)
        && (meal.isEmpty
          || (meal == "break"
            ? row["time"].array.isEmpty : row["time"].array.contains(.string(meal))))
        && (category.isEmpty || row["group"].string == category)
        && (spicy.isEmpty
          || (spicy == "yes" ? row["spicy"] == .bool(true) : row["spicy"] == .bool(false)))
        && (rating.isEmpty || (row["rating_avg"].double ?? 0) >= (Double(rating) ?? 0))
        && (minPrice.isEmpty
          || (row["price"].double.map { $0 >= (Double(minPrice) ?? 0) } ?? false))
        && (maxPrice.isEmpty
          || (row["price"].double.map { $0 <= (Double(maxPrice) ?? 0) } ?? false))
        && matches(row)
    }
  }
  private func matches(_ row: JSONValue) -> Bool {
    let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased().replacingOccurrences(
      of: " ", with: "")
    return q.isEmpty
      || ["name", "pinyin", "pinyin_initials"].contains { row[$0].string.lowercased().contains(q) }
  }
  private var grouped: [String: [JSONValue]] {
    Dictionary(grouping: filtered) { row in
      "\(row["time"].array.map { mealNames[$0.string] ?? $0.string }.joined(separator: " / ")) · \(row.text("place", "地点未注明")) · \(row["group"].string)"
    }
  }
  private var groupKeys: [String] { grouped.keys.sorted() }
  private func uniqueDishes(_ rows: [JSONValue]) -> [JSONValue] { SupplySummary.merge(rows) }
  private func dailyColumn(title: String, day: String, selection: Binding<String>) -> some View {
    let rows = uniqueDishes(
      records.filter {
        $0["date"].string == day
          && ($0["place"].string.contains("正谊") ? "zhengyi" : "main") == campus
          && (selection.wrappedValue == "break"
            ? $0["time"].array.isEmpty : $0["time"].array.contains(.string(selection.wrappedValue)))
          && matches($0)
      })
    return VStack(alignment: .leading, spacing: 14) {
      HStack {
        VStack(alignment: .leading, spacing: 5) {
          Text(title).font(.title2.bold())
          Text(day).font(.caption).foregroundStyle(.secondary)
        }
        Spacer()
        Picker("\(title)餐次", selection: selection) {
          ForEach(mealOrder, id: \.self) { Text(mealNames[$0] ?? $0).tag($0) }
        }.pickerStyle(.menu)
      }
      if rows.isEmpty {
        EmptyView(title: "暂无已公布的供应", description: "可切换日期、校区或餐次。供应以食堂实际安排为准。", icon: "fork.knife")
      } else {
        supplyGrid(rows)
      }
    }.frame(maxWidth: .infinity, alignment: .topLeading)
  }
  private func supplyGrid(_ rows: [JSONValue]) -> some View {
    LazyVGrid(columns: [GridItem(.adaptive(minimum: 265), alignment: .top)], spacing: 14) {
      ForEach(rows, id: \.self) { row in
        NavigationLink(value: AppRoute.dish(row["dish_id"].int)) {
          VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top) {
              Text(row["name"].string).font(.headline)
              if row["spicy"].flag { Text("🌶").accessibilityLabel("原食谱标记辣椒") }
              Spacer()
              Text(row.text("price_label", money(row["price"]))).font(.subheadline).foregroundStyle(
                .tint)
            }
            Text(
              [row.text("place", "地点未注明"), row["group"].string].filter { !$0.isEmpty }.joined(
                separator: " · ")
            ).font(.caption).foregroundStyle(.secondary)
            RatingView(value: row["rating_avg"], count: row["reviews_count"].int)
          }.padding(18).frame(maxWidth: .infinity, alignment: .leading).background(
            Color(.secondarySystemGroupedBackground), in: .rect(cornerRadius: 20))
        }.buttonStyle(.plain)
      }
    }
  }
  private var filterForm: some View {
    Form {
      Section("供应信息") {
        Picker("日期", selection: $day) {
          Text("全部日期").tag("")
          ForEach(days, id: \.self) { Text($0).tag($0) }
        }
        optionsPicker("地点", key: "place", selection: $place)
        Picker("餐次", selection: $meal) {
          Text("全部餐次").tag("")
          ForEach(mealOrder, id: \.self) { Text(mealNames[$0] ?? $0).tag($0) }
        }
        optionsPicker("分类", key: "group", selection: $category)
      }
      Section("口味与价格") {
        Picker("辣椒标记", selection: $spicy) {
          Text("不限").tag("")
          Text("有辣椒").tag("yes")
          Text("无辣椒").tag("no")
        }
        Picker("最低评分", selection: $rating) {
          Text("不限").tag("")
          ForEach(1...5, id: \.self) { Text("\($0) 星").tag(String($0)) }
        }
        TextField("最低价格（元）", text: $minPrice).keyboardType(.decimalPad)
        TextField("最高价格（元）", text: $maxPrice).keyboardType(.decimalPad)
      }
    }
  }
  private func optionsPicker(_ title: String, key: String, selection: Binding<String>) -> some View
  {
    Picker(title, selection: selection) {
      Text("全部\(title)").tag("")
      ForEach(
        Array(Set(records.map { $0[key].string }.filter { !$0.isEmpty })).sorted(), id: \.self
      ) { Text($0).tag($0) }
    }
  }
  private func clearFilters() {
    day = ""
    place = ""
    meal = ""
    category = ""
    spicy = ""
    rating = ""
    minPrice = ""
    maxPrice = ""
    query = ""
  }
  private func load() async {
    await resource.load(app.api, menuPath, authenticated: false)
    if mode == .weekly && !days.contains(day) {
      day = days.first { $0 >= SytimeDate.day() } ?? days.first ?? ""
    }
  }
}

struct DishDetailView: View {
  @Environment(AppModel.self) private var app
  let id: Int
  @State private var writing = false
  @State private var revision = 0
  var body: some View {
    APIContent(path: "/api/dishes/\(id)", authenticated: false) { data in
      List {
        Section {
          Text(data["dish"]["name"].string).font(.largeTitle.bold())
          RatingView(value: data["dish"]["rating_avg"], count: data["dish"]["reviews_count"].int)
          Button {
            if app.requireAccount(student: true) { writing = true }
          } label: {
            Label("写评价", systemImage: "square.and.pencil")
          }.buttonStyle(.glassProminent)
        }
        Section("近期供应") {
          if data["supplies"].array.isEmpty {
            Text("近期食谱暂未安排这道菜，仍可查看和发表评价。").foregroundStyle(.secondary)
          }
          ForEach(data["supplies"].array, id: \.self) { row in
            VStack(alignment: .leading, spacing: 6) {
              Text(
                "\(row["date"].string) · \(row["time"].array.map { mealNames[$0.string] ?? $0.string }.joined(separator: " / "))"
              ).font(.headline)
              Text("\(row.text("place", "地点未注明")) · \(money(row["price"]))").font(.subheadline)
                .foregroundStyle(.secondary)
              if let url = URL(string: row["url"].string), url.scheme == "https" {
                Link("查看学校原文", destination: url).font(.caption)
              }
            }.padding(.vertical, 4)
          }
        }
        Section("同学们的评价") { PagedReviews(path: "/api/dishes/\(id)/reviews").id(revision) }
      }
      .sheet(isPresented: $writing) {
        NavigationStack {
          ReviewEditor(kind: .dish(id, data["dish"]["name"].string), onSaved: { revision += 1 })
        }
      }
    }.navigationTitle("菜品详情").navigationBarTitleDisplayMode(.inline)
  }
}

enum ReviewKind {
  case dish(Int, String)
  case shop(Int, String, JSONValue)
}
struct ReviewEditor: View {
  @Environment(AppModel.self) private var app
  @Environment(\.dismiss) private var dismiss
  let kind: ReviewKind
  let onSaved: () -> Void
  @State private var rating = 0
  @State private var comment = ""
  @State private var guests = ""
  @State private var total = ""
  @State private var photo: Data?
  @State private var removeImage = false
  @State private var saving = false
  @State private var error: String?
  @State private var discard = false
  private var shop: Bool { if case .shop = kind { true } else { false } }
  private var name: String {
    switch kind {
    case .dish(_, let name), .shop(_, let name, _): name
    }
  }
  var body: some View {
    Form {
      Section(name) {
        Picker("评分（必选）", selection: $rating) {
          Text("请选择").tag(0)
          ForEach(1...5, id: \.self) { Text(String(repeating: "★", count: $0)).tag($0) }
        }
        TextField("分享你的感受（可选，最多 500 字）", text: $comment, axis: .vertical).lineLimit(4...10)
      }
      if shop {
        Section("用餐信息（可选）") {
          TextField("用餐人数", text: $guests).keyboardType(.numberPad)
          TextField("总价（元）", text: $total).keyboardType(.decimalPad)
        }
      }
      Section("评价配图") {
        PhotoField(data: $photo)
        if case .shop(_, _, let mine) = kind, !mine["image_url"].string.isEmpty {
          Toggle("移除原评价的图片", isOn: $removeImage)
        }
        Text("图片在审核通过后公开；提交失败会保留本次输入。").font(.caption).foregroundStyle(.secondary)
      }
      if let error { Section { Text(error).foregroundStyle(.red) } }
    }
    .navigationTitle("写评价").navigationBarTitleDisplayMode(.inline)
    .interactiveDismissDisabled(saving || !comment.isEmpty || rating != 0 || photo != nil)
    .toolbar {
      ToolbarItem(placement: .cancellationAction) {
        Button("取消") {
          if !comment.isEmpty || rating != 0 || photo != nil { discard = true } else { dismiss() }
        }.disabled(saving)
      }
      ToolbarItem(placement: .confirmationAction) {
        Button(saving ? "提交中…" : "提交审核") { Task { await save() } }.disabled(
          saving || rating == 0 || comment.count > 500)
      }
    }
    .confirmationDialog("放弃本次评价草稿？", isPresented: $discard, titleVisibility: .visible) {
      Button("放弃草稿", role: .destructive) { dismiss() }
    }
    .task {
      if case .shop(_, _, let mine) = kind, !mine.isNull {
        rating = mine["rating"].int
        comment = mine.text("content", mine["comment"].string)
        guests = mine["guests"].string
        total = mine["total_price"].string
      }
    }
  }
  private func save() async {
    guard (1...5).contains(rating), comment.count <= 500 else {
      error = "请选择评分，评论最多 500 字"
      return
    }
    if !guests.isEmpty && (Int(guests) == nil || (Int(guests) ?? 0) <= 0) {
      error = "用餐人数必须为正整数"
      return
    }
    if !total.isEmpty && (Double(total) == nil || (Double(total) ?? -1) < 0) {
      error = "总价不能为负数"
      return
    }
    saving = true
    error = nil
    defer { saving = false }
    do {
      switch kind {
      case .dish(let id, let name):
        _ = try await app.api.upload(
          "/api/recipes",
          fields: [
            "dish_id": String(id), "name": name, "rating": String(rating), "comment": comment,
          ], image: photo)
      case .shop(let id, _, _):
        var fields = [
          "rating": String(rating), "content": comment, "guests": guests, "total_price": total,
        ]
        if removeImage { fields["remove_image"] = "1" }
        _ = try await app.api.upload("/api/shops/\(id)/reviews", fields: fields, image: photo)
      }
      onSaved()
      dismiss()
      app.notice = "评价已提交审核，通过后公开。修改期间原评价保持不变。"
    } catch { self.error = error.localizedDescription }
  }
}

/// Preserve every supply variant when a dish appears at several counters or prices.
enum SupplySummary {
  static func merge(_ rows: [JSONValue]) -> [JSONValue] {
    var order: [Int] = []
    var groups: [Int: [JSONValue]] = [:]
    for row in rows {
      let id = row["dish_id"].int
      if groups[id] == nil { order.append(id) }
      groups[id, default: []].append(row)
    }
    return order.compactMap { id in
      guard let variants = groups[id], let first = variants.first else { return nil }
      var value = first.object
      let prices = Array(Set(variants.compactMap { $0["price"].double })).sorted()
      if let min = prices.first, let max = prices.last {
        value["price_label"] = .string(
          min == max ? money(.number(min)) : "\(money(.number(min)))–\(money(.number(max)))")
      }
      value["place"] = .string(
        Array(Set(variants.map { $0["place"].string }.filter { !$0.isEmpty })).sorted().joined(
          separator: " / "))
      value["group"] = .string(
        Array(Set(variants.map { $0["group"].string }.filter { !$0.isEmpty })).sorted().joined(
          separator: " / "))
      return .object(value)
    }
  }
}
