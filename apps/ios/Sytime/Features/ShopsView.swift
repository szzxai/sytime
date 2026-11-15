import MapKit
import SwiftUI

struct ShopsView: View {
  @Environment(AppModel.self) private var app
  @State private var query = ""
  @State private var effectiveQuery = ""
  @State private var filters: [String: String] = ["sort": "campus"]
  @State private var showFilters = false
  @State private var showMap = false
  @State private var showNew = false
  @State private var limit = 20
  @State private var preferenceApplied = false
  private var path: String {
    APIClient.path("/api/shops", query: filters.merging(["q": effectiveQuery]) { _, new in new })
  }
  var body: some View {
    APIContent(path: path) { data in
      GeometryReader { geometry in
        let wide = geometry.size.width > 950
        HStack(spacing: 0) {
          if !showMap || wide {
            shopList(data).frame(maxWidth: wide ? geometry.size.width * 0.5 : .infinity)
          }
          if showMap || wide { ShopsMap(shops: data["shops"].array).frame(maxWidth: .infinity) }
        }
      }
      .sheet(isPresented: $showFilters) {
        NavigationStack {
          filterForm(data).navigationTitle("筛选周边美食").toolbar {
            ToolbarItem(placement: .cancellationAction) {
              Button("清除") {
                filters = ["sort": "campus"]
                query = ""
              }
            }
            ToolbarItem(placement: .confirmationAction) { Button("完成") { showFilters = false } }
          }
        }
      }
    }
    .navigationTitle("三元坊必吃榜")
    .searchable(text: $query, prompt: "店名、道路、商场")
    .task(id: query) {
      do {
        try await Task.sleep(for: .milliseconds(250))
        effectiveQuery = query
        limit = 20
      } catch {}
    }
    .task(id: app.user.id) {
      if !preferenceApplied && !app.user.isNull {
        preferenceApplied = true
        filters["sort"] = app.user.text("shop_default_sort", "campus")
        filters["type"] = app.user["shop_default_type"].string
      }
    }
    .toolbar {
      ToolbarItemGroup(placement: .topBarTrailing) {
        Button("筛选", systemImage: "line.3.horizontal.decrease") { showFilters = true }
        Button(showMap ? "显示列表" : "显示地图", systemImage: showMap ? "list.bullet" : "map") {
          showMap.toggle()
        }
        Button("推荐店铺", systemImage: "plus") {
          if app.requireAccount(student: true) { showNew = true }
        }
      }
    }
    .sheet(isPresented: $showNew) { NavigationStack { ShopRecommendationView() } }
  }
  private func shopList(_ data: JSONValue) -> some View {
    List {
      Section {
        Text(data["area"]["text"].string).font(.caption).foregroundStyle(.secondary)
        Text("校园与地铁距离为步行路线距离，非直线距离。").font(.caption).foregroundStyle(.secondary)
        Picker(
          "排序",
          selection: Binding(get: { filters["sort"] ?? "campus" }, set: { filters["sort"] = $0 })
        ) {
          ForEach(["campus", "az", "metro", "likes", "reviews", "rating", "new"], id: \.self) {
            Text(shopSorts[$0] ?? $0).tag($0)
          }
        }
      }
      if data["shops"].array.isEmpty {
        EmptyView(title: "没有匹配的店铺", description: "试试其他关键词或清除筛选。", icon: "storefront")
      }
      ForEach(Array(data["shops"].array.prefix(limit))) { shop in
        NavigationLink(value: AppRoute.shop(shop["id"].int)) { ShopRow(shop: shop) }
      }
      if data["shops"].array.count > limit { Button("加载更多店铺") { limit += 20 } }
    }
  }
  private func filterForm(_ data: JSONValue) -> some View {
    Form {
      Section("类型") {
        FormFields(
          fields: [
            FormField(
              "type", "店铺类型",
              .choice([("", "全部类型")] + data["types"]["all"].array.map { ($0.string, $0.string) }),
              required: false)
          ], values: $filters)
      }
      ForEach(
        [
          ("校园步行距离（米）", "distance_min_m", "distance_max_m"), ("校园步行时间（分钟）", "walk_min", "walk_max"),
          ("点赞数", "likes_min", "likes_max"), ("评价数", "reviews_min", "reviews_max"),
          ("评分（1–5）", "rating_min", "rating_max"),
        ], id: \.0
      ) { item in
        Section(item.0) {
          FormFields(
            fields: [
              FormField(item.1, "最小值", .decimal, required: false),
              FormField(item.2, "最大值", .decimal, required: false),
            ], values: $filters)
        }
      }
    }
  }
}

struct ShopRow: View {
  let shop: JSONValue
  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack {
        Text(shop["name"].string).font(.headline)
        Spacer()
        Text(shop["type"].string).font(.caption).foregroundStyle(.tint)
      }
      Text(shop["address"].string).font(.subheadline).foregroundStyle(.secondary)
      Label(
        "从学校步行 \(shop["campus_walk_min"].string) 分钟 · \(shop["campus_distance_m"].string) 米",
        systemImage: "figure.walk"
      ).font(.caption).foregroundStyle(.secondary)
      HStack {
        RatingView(value: shop["rating_avg"], count: shop["reviews_count"].int)
        Spacer()
        Label(shop["likes_count"].string, systemImage: "heart").font(.caption).foregroundStyle(
          .secondary)
      }
      if !shop["metro_station"].string.isEmpty {
        Label(
          "\(shop["metro_station"].string) \(shop["metro_exit"].string) · \(shop["metro_walk_min"].string) 分钟",
          systemImage: "tram"
        ).font(.caption).foregroundStyle(.secondary)
      }
    }.padding(.vertical, 10)
  }
}

struct ShopsMap: View {
  let shops: [JSONValue]
  @State private var position: MapCameraPosition = .automatic
  var body: some View {
    Map(position: $position) {
      ForEach(shops) { shop in
        if let lat = shop["lat"].double, let lng = shop["lng"].double {
          Annotation(shop["name"].string, coordinate: GCJ02.wgs84(latitude: lat, longitude: lng)) {
            NavigationLink(value: AppRoute.shop(shop["id"].int)) {
              Image(systemName: "fork.knife").font(.callout.bold()).padding(10).foregroundStyle(
                .white
              ).background(.tint, in: .circle)
            }.buttonStyle(.plain).accessibilityLabel("查看\(shop["name"].string)")
          }
        }
      }
    }
    .mapControls {
      MapCompass()
      MapScaleView()
    }
    .overlay(alignment: .bottomTrailing) {
      Button("回到姑苏区全域", systemImage: "arrow.up.left.and.arrow.down.right") {
        position = .region(
          MKCoordinateRegion(
            center: GCJ02.wgs84(latitude: 31.317748, longitude: 120.597977),
            span: MKCoordinateSpan(latitudeDelta: 0.18, longitudeDelta: 0.18)))
      }.labelStyle(.iconOnly).padding().glassEffect().padding()
    }
    .onAppear {
      if shops.isEmpty {
        position = .region(
          MKCoordinateRegion(
            center: GCJ02.wgs84(latitude: 31.3004, longitude: 120.6226),
            span: .init(latitudeDelta: 0.06, longitudeDelta: 0.06)))
      }
    }
    .accessibilityLabel("周边店铺分布地图")
  }
}

/// The server uses AMap GCJ-02 coordinates; MapKit's public coordinate model uses WGS-84.
enum GCJ02 {
  static func wgs84(latitude lat: Double, longitude lng: Double) -> CLLocationCoordinate2D {
    guard (72.004...137.8347).contains(lng), (0.8293...55.8271).contains(lat) else {
      return .init(latitude: lat, longitude: lng)
    }
    let x = lng - 105
    let y = lat - 35
    let pi = Double.pi
    var dLat = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * sqrt(abs(x))
    dLat += (20 * sin(6 * x * pi) + 20 * sin(2 * x * pi)) * 2 / 3
    dLat += (20 * sin(y * pi) + 40 * sin(y / 3 * pi)) * 2 / 3
    dLat += (160 * sin(y / 12 * pi) + 320 * sin(y * pi / 30)) * 2 / 3
    var dLng = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * sqrt(abs(x))
    dLng += (20 * sin(6 * x * pi) + 20 * sin(2 * x * pi)) * 2 / 3
    dLng += (20 * sin(x * pi) + 40 * sin(x / 3 * pi)) * 2 / 3
    dLng += (150 * sin(x / 12 * pi) + 300 * sin(x / 30 * pi)) * 2 / 3
    let rad = lat / 180 * pi
    let magic = 1 - 0.00669342162296594323 * pow(sin(rad), 2)
    dLat = dLat * 180 / ((6_378_245 * (1 - 0.00669342162296594323)) / (magic * sqrt(magic)) * pi)
    dLng = dLng * 180 / (6_378_245 / sqrt(magic) * cos(rad) * pi)
    return .init(latitude: lat - dLat, longitude: lng - dLng)
  }
}

struct ShopDetailView: View {
  @Environment(AppModel.self) private var app
  let id: Int
  @State private var detail = Resource()
  @State private var mine: JSONValue = .null
  @State private var writing = false
  @State private var collecting = false
  @State private var deleting = false
  @State private var busy = false
  @State private var reviewRevision = 0
  var body: some View {
    Group {
      if detail.value.isNull {
        if let error = detail.error {
          FailureView(message: error) { await load() }
        } else {
          ProgressView()
        }
      } else {
        let shop = detail.value["shop"]
        GeometryReader { geometry in
          let split =
            geometry.size.width >= 760
            && (app.user["shop_layout_mode"].string != "manual"
              || app.user["shop_layout"].string == "split")
          HStack(spacing: 0) {
            List {
              information(shop)
              if !split { opinions() }
              if let error = detail.error {
                Section {
                  Text(error).foregroundStyle(.red)
                  Button("重试") { Task { await load() } }
                }
              }
            }.refreshable { await load() }
            if split {
              Divider()
              List { opinions() }.frame(maxWidth: .infinity).refreshable { await load() }
            }
          }
        }
        .sheet(isPresented: $writing) {
          NavigationStack {
            ReviewEditor(
              kind: .shop(id, shop["name"].string, mine),
              onSaved: {
                reviewRevision += 1
                Task { await load() }
              })
          }
        }
        .sheet(isPresented: $collecting) { NavigationStack { CollectionPicker(shopID: id) } }
      }
    }
    .navigationTitle("店铺详情").navigationBarTitleDisplayMode(.inline)
    .task(id: app.sessionRevision) { await load() }
    .confirmationDialog(
      "删除自己的评价？删除后无法恢复，并撤回相关待审修改。", isPresented: $deleting, titleVisibility: .visible
    ) {
      Button("删除评价", role: .destructive) {
        Task {
          if await app.act("/api/shops/\(id)/reviews/me", method: "DELETE", success: "评价已删除") {
            reviewRevision += 1
            await load()
          }
        }
      }
    }
  }
  @ViewBuilder private func information(_ shop: JSONValue) -> some View {
    Section {
      Text(shop["name"].string).font(.largeTitle.bold())
      RatingView(value: shop["rating_avg"], count: shop["reviews_count"].int)
      Text("\(shop["type"].string) · \(shop["ratings_count"].string) 人评分").font(.subheadline)
        .foregroundStyle(.secondary)
      HStack(spacing: 12) { actions(shop) }.buttonStyle(.glass).fixedSize(
        horizontal: false, vertical: true
      ).padding(.vertical, 4)
    }
    Section("找到这家店") {
      Text(shop["address"].string).textSelection(.enabled)
      if !shop["location_note"].string.isEmpty {
        Text(shop["location_note"].string).foregroundStyle(.secondary)
      }
      LabeledContent(
        "校园步行",
        value: "\(shop["campus_distance_m"].string) 米 · \(shop["campus_walk_min"].string) 分钟")
      LabeledContent(
        "地铁步行",
        value:
          "\(shop["metro_station"].string) \(shop["metro_exit"].string) · \(shop["metro_distance_m"].string) 米 · \(shop["metro_walk_min"].string) 分钟"
      )
      ShopsMap(shops: [shop]).frame(height: 260).listRowInsets(EdgeInsets())
      if let url = URL(
        string:
          "https://uri.amap.com/marker?position=\(shop["lng"].string),\(shop["lat"].string)&coordinate=gaode"
      ) {
        Link("在高德地图打开", destination: url)
      }
      if let url = URL(string: shop["dianping_url"].string), url.scheme == "https",
        let host = url.host, host == "dianping.com" || host.hasSuffix(".dianping.com")
      {
        Link("在大众点评查看", destination: url)
      }
    }
    Section("店铺菜品") {
      if shop["dishes"].array.isEmpty { Text("暂无菜品目录").foregroundStyle(.secondary) }
      ForEach(shop["dishes"].array, id: \.self) {
        LabeledContent($0["name"].string, value: money($0["price"]))
      }
    }
  }
  @ViewBuilder private func opinions() -> some View {
    if !mine.isNull {
      Section("我的评价") {
        RatingView(value: mine["rating"])
        Text(mine["content"].string)
        Button("修改评价") { writing = true }
        Button("删除评价", role: .destructive) { deleting = true }
      }
    }
    Section("同学们的评价") { PagedReviews(path: "/api/shops/\(id)/reviews").id(reviewRevision) }
  }
  @ViewBuilder private func actions(_ shop: JSONValue) -> some View {
    Button {
      Task {
        guard app.requireAccount(student: true), !busy else { return }
        busy = true
        defer { busy = false }
        do {
          _ = try await app.api.request("/api/shops/\(id)/like", method: "POST")
          await load()
        } catch { app.notice = error.localizedDescription }
      }
    } label: {
      Label(
        "\(shop["likes_count"].string) 点赞",
        systemImage: shop["user_liked"].flag ? "heart.fill" : "heart")
    }.disabled(busy)
    Button {
      if app.requireAccount(student: true) { writing = true }
    } label: {
      Label("写评价", systemImage: "square.and.pencil")
    }
    Button {
      if app.requireAccount() { collecting = true }
    } label: {
      Label("收藏", systemImage: "bookmark")
    }
  }
  private func load() async {
    await detail.load(app.api, "/api/shops/\(id)")
    do { mine = try await app.api.request("/api/shops/\(id)/reviews?limit=1")["my_review"] } catch {
      // Review list exposes its own retry state.
    }
  }
}

struct ShopRecommendationView: View {
  @Environment(AppModel.self) private var app
  var body: some View {
    APIContent(path: "/api/shops/meta") { data in
      NativeForm(
        title: "推荐新店铺", path: "/api/shops",
        fields: [
          FormField("name", "店铺名称", max: 80), FormField("address", "道路、门牌号", max: 200),
          FormField(
            "type", "类型（最多八字）", max: 8,
            help: "已有类型：" + data["types"]["all"].array.map(\.string).joined(separator: "、")),
          FormField("lat", "高德纬度 GCJ-02", .decimal), FormField("lng", "高德经度 GCJ-02", .decimal),
          FormField("campus_distance_m", "校园步行距离（米）", .decimal),
          FormField("campus_walk_min", "校园步行时间（分钟）", .decimal),
          FormField("metro_station", "地铁站"), FormField("metro_exit", "地铁出口"),
          FormField("metro_distance_m", "地铁步行距离（米）", .decimal),
          FormField("metro_walk_min", "地铁步行时间（分钟）", .decimal),
          FormField("location_note", "位置补充（可选）", .multiline, required: false, max: 500),
          FormField("dianping_url", "大众点评链接（可选）", required: false),
        ], explanation: "收录范围：\(data["area"]["text"].string)。请从高德地图核对坐标与步行路线，学生每天最多推荐 10 家。",
        success: "店铺推荐已提交审核，通过后收录", coordinatePreview: true)
    }
  }
}
