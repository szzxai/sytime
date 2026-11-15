import SwiftUI
import UIKit

struct CampusCatalog: Decodable {
  let places: [CampusPlace]
  let sources: [String: Source]
  struct Source: Decodable {
    let label: String
    let url: URL
  }
  static let bundled: CampusCatalog? = {
    guard let url = Bundle.main.url(forResource: "CampusPlaces", withExtension: "json"),
      let data = try? Data(contentsOf: url)
    else { return nil }
    return try? JSONDecoder().decode(CampusCatalog.self, from: data)
  }()
}
struct CampusPlace: Decodable, Identifiable, Hashable {
  let id: String, name: String, category: String, icon: String, area: String, description: String,
    summary: String
  let x: Double, y: Double, size: Double
  let height: Double?
  let alias: String?
  let sources: [String]?
  var categoryName: String { campusCategories[category] ?? "校园" }
  func matches(_ query: String, category: String) -> Bool {
    (category.isEmpty || self.category == category)
      && (query.isEmpty
        || "\(name) \(alias ?? "") \(description) \(area) \(categoryName)"
          .localizedStandardContains(query))
  }
}
let campusCategories = [
  "study": "教学", "heritage": "人文", "nature": "园林", "life": "生活", "sport": "运动", "gate": "出入口",
]

struct CampusView: View {
  @State private var query = ""
  @State private var category = ""
  @State private var selected: CampusPlace?
  @State private var directory = false
  @State private var reset = 0
  @State private var zoomCommand = 0
  private var places: [CampusPlace] {
    CampusCatalog.bundled?.places.filter { $0.matches(query, category: category) } ?? []
  }
  var body: some View {
    GeometryReader { geometry in
      let wide = geometry.size.width >= 760
      HStack(spacing: 0) {
        if wide { directoryList.frame(width: min(340, geometry.size.width * 0.35)) }
        ZStack(alignment: .bottomLeading) {
          CampusAtlas(
            places: places, selected: selected?.id, reset: reset, zoomCommand: zoomCommand
          ) {
            selected = $0
            directory = false
          }
          HStack {
            Label("上方为北 · 校园位置示意", systemImage: "location.north.circle").font(.caption)
            Spacer()
          }.padding(12).glassEffect(in: .rect(cornerRadius: 16)).padding()
        }
        .overlay(alignment: .topTrailing) {
          VStack(spacing: 14) {
            Button("放大地图", systemImage: "plus.magnifyingglass") { zoomCommand += 1 }.labelStyle(
              .iconOnly)
            Button("缩小地图", systemImage: "minus.magnifyingglass") { zoomCommand -= 1 }.labelStyle(
              .iconOnly)
            Button("回到校园全景", systemImage: "arrow.up.left.and.arrow.down.right") {
              selected = nil
              reset += 1
            }.labelStyle(.iconOnly)
          }.padding().glassEffect(in: .capsule).padding()
        }
      }
      .toolbar {
        if !wide {
          ToolbarItem(placement: .topBarTrailing) {
            Button("地点目录", systemImage: "list.bullet") { directory = true }
          }
        }
      }
      .sheet(isPresented: $directory) {
        NavigationStack {
          directoryList.navigationTitle("地点目录").toolbar {
            ToolbarItem(placement: .confirmationAction) { Button("完成") { directory = false } }
          }
        }.presentationDetents([.medium, .large])
      }
    }
    .navigationTitle("校园地图").navigationBarTitleDisplayMode(.inline)
    .sheet(item: $selected) { place in
      NavigationStack {
        List {
          Section {
            Text(place.name).font(.largeTitle.bold())
            Label(place.categoryName + " · " + place.area, systemImage: "mappin.and.ellipse").font(
              .subheadline
            ).foregroundStyle(.secondary)
            if let alias = place.alias { Text("又名：\(alias)").font(.footnote) }
          }
          Section { Text(place.description).textSelection(.enabled) }
          if let sources = place.sources {
            Section("公开资料来源") {
              ForEach(sources, id: \.self) { key in
                if let source = CampusCatalog.bundled?.sources[key] {
                  Link(source.label, destination: source.url)
                }
              }
            }
          }
          Section {
            Text("校园位置示意，不提供实时开放状态或路线规划。实际通行以校方安排为准。").font(.footnote).foregroundStyle(.secondary)
          }
        }.navigationTitle(place.name).navigationBarTitleDisplayMode(.inline)
          .toolbar {
            ToolbarItem(placement: .confirmationAction) { Button("完成") { selected = nil } }
          }
      }.presentationDetents([.medium, .large]).presentationBackgroundInteraction(
        .enabled(upThrough: .medium))
    }
  }
  private var directoryList: some View {
    List {
      Section {
        Picker("地点分类", selection: $category) {
          Text("全部").tag("")
          ForEach(["study", "heritage", "nature", "life", "sport", "gate"], id: \.self) {
            Text(campusCategories[$0] ?? $0).tag($0)
          }
        }
        Text("\(places.count) 个地点 · 本部校园 · 苏州 · 人民路").font(.caption).foregroundStyle(.secondary)
      }
      if places.isEmpty {
        ContentUnavailableView.search(text: query)
        Button("查看全部地点") {
          query = ""
          category = ""
        }
      }
      ForEach(places) { place in
        Button {
          directory = false
          DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { selected = place }
        } label: {
          HStack {
            Image(
              systemName: place.category == "nature"
                ? "leaf" : place.category == "sport" ? "sportscourt" : "building.2"
            ).foregroundStyle(.tint).frame(width: 28)
            VStack(alignment: .leading, spacing: 5) {
              Text(place.name).foregroundStyle(.primary)
              Text(place.summary).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Image(systemName: "chevron.right").font(.caption).foregroundStyle(.tertiary)
          }.padding(.vertical, 4)
        }
      }
    }.searchable(text: $query, prompt: "寻找校园里的一个地方")
      .onSubmit(of: .search) {
        if let first = places.first {
          selected = first
          directory = false
        }
      }
      .onChange(of: query) { _, _ in
        if let selected, !places.contains(where: { $0.id == selected.id }) { self.selected = nil }
      }
      .onChange(of: category) { _, _ in
        if let selected, !places.contains(where: { $0.id == selected.id }) { self.selected = nil }
      }
  }
}

/// Native UIScrollView provides bounded pan, pinch, rotation resizing and VoiceOver targets.
struct CampusAtlas: UIViewRepresentable {
  @Environment(\.colorScheme) private var colorScheme
  let places: [CampusPlace]
  let selected: String?
  let reset: Int
  let zoomCommand: Int
  let onSelect: (CampusPlace) -> Void
  func makeUIView(context: Context) -> AtlasScrollView {
    let view = AtlasScrollView()
    view.onSelect = onSelect
    return view
  }
  func updateUIView(_ view: AtlasScrollView, context: Context) {
    view.onSelect = onSelect
    view.art.image = UIImage(named: colorScheme == .dark ? "Campus-dark.png" : "Campus-light.png")
    view.configure(places, selected: selected, reset: reset, command: zoomCommand)
  }
}
final class AtlasScrollView: UIScrollView, UIScrollViewDelegate {
  let art = UIImageView(frame: CGRect(x: 0, y: 0, width: 1000, height: 1540))
  var onSelect: ((CampusPlace) -> Void)?
  private var buttons: [String: UIButton] = [:]
  private var previousSize = CGSize.zero
  private var previousReset = 0
  private var previousCommand = 0
  private var selectedID: String?
  override init(frame: CGRect) {
    super.init(frame: frame)
    delegate = self
    art.isUserInteractionEnabled = true
    addSubview(art)
    contentSize = art.bounds.size
    backgroundColor = .white
    bouncesZoom = true
    showsVerticalScrollIndicator = false
    showsHorizontalScrollIndicator = false
  }
  required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
  override func layoutSubviews() {
    super.layoutSubviews()
    if bounds.size != previousSize && bounds.width > 0 && bounds.height > 0 {
      let oldMinimum = minimumZoomScale
      let wasFit = abs(zoomScale - oldMinimum) < 0.02
      previousSize = bounds.size
      minimumZoomScale = min(bounds.width / 1000, bounds.height / 1540)
      maximumZoomScale = max(minimumZoomScale * 5, 2)
      if wasFit || oldMinimum == 1 { setZoomScale(minimumZoomScale, animated: false) }
    }
    centerArt()
  }
  func viewForZooming(in scrollView: UIScrollView) -> UIView? { art }
  func scrollViewDidZoom(_ scrollView: UIScrollView) { centerArt() }
  private func centerArt() {
    contentInset = UIEdgeInsets(
      top: max(0, (bounds.height - art.frame.height) / 2),
      left: max(0, (bounds.width - art.frame.width) / 2), bottom: 0, right: 0)
  }
  func configure(_ places: [CampusPlace], selected: String?, reset: Int, command: Int) {
    for button in buttons.values { button.removeFromSuperview() }
    buttons.removeAll()
    for p in places {
      let b = UIButton(type: .custom)
      b.frame = CGRect(
        x: p.x - p.size / 2, y: p.y - (p.height ?? p.size * 0.75) / 2, width: p.size,
        height: p.height ?? p.size * 0.75)
      b.accessibilityLabel = "\(p.name)，\(p.categoryName)，\(p.summary)"
      b.accessibilityTraits = p.id == selected ? [.button, .selected] : [.button]
      if p.id == selected {
        b.layer.borderWidth = 4
        b.layer.borderColor = UIColor.tintColor.cgColor
        b.layer.cornerRadius = 8
        b.backgroundColor = UIColor.tintColor.withAlphaComponent(0.12)
      }
      b.addAction(UIAction { [weak self] _ in self?.onSelect?(p) }, for: .touchUpInside)
      art.addSubview(b)
      buttons[p.id] = b
    }
    if previousReset != reset {
      setZoomScale(minimumZoomScale, animated: !UIAccessibility.isReduceMotionEnabled)
      previousReset = reset
    }
    if previousCommand != command {
      let factor = command > previousCommand ? 1.35 : 1 / 1.35
      setZoomScale(
        min(maximumZoomScale, max(minimumZoomScale, zoomScale * factor)),
        animated: !UIAccessibility.isReduceMotionEnabled)
      previousCommand = command
    }
    if selectedID != selected, let selected, let button = buttons[selected] {
      let rect = button.frame.insetBy(dx: -100, dy: -100)
      zoom(to: rect, animated: !UIAccessibility.isReduceMotionEnabled)
    }
    selectedID = selected
  }
}
