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
            Label("双指缩放与旋转", systemImage: "hand.draw").font(.caption)
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

/// Native gestures move the atlas and its VoiceOver targets in the same coordinate space.
struct CampusAtlas: UIViewRepresentable {
  @Environment(\.colorScheme) private var colorScheme
  let places: [CampusPlace]
  let selected: String?
  let reset: Int
  let zoomCommand: Int
  let onSelect: (CampusPlace) -> Void
  func makeUIView(context: Context) -> AtlasMapView {
    let view = AtlasMapView()
    view.onSelect = onSelect
    return view
  }
  func updateUIView(_ view: AtlasMapView, context: Context) {
    view.onSelect = onSelect
    view.art.image = UIImage(named: colorScheme == .dark ? "Campus-dark.png" : "Campus-light.png")
    view.configure(places, selected: selected, reset: reset, command: zoomCommand)
  }
}
final class AtlasMapView: UIView, UIGestureRecognizerDelegate {
  let art = UIImageView(frame: CGRect(x: 0, y: 0, width: 1000, height: 1540))
  var onSelect: ((CampusPlace) -> Void)?
  private var buttons: [String: UIButton] = [:]
  private var previousPlaces: [CampusPlace] = []
  private var previousSize = CGSize.zero
  private var previousReset = 0
  private var previousCommand = 0
  private var selectedID: String?
  private var scale: CGFloat = 1
  private var angle: CGFloat = 0
  private var mapCenter = CGPoint.zero
  private lazy var pan = UIPanGestureRecognizer(target: self, action: #selector(handlePan))
  private lazy var pinch = UIPinchGestureRecognizer(target: self, action: #selector(handlePinch))
  private lazy var rotation = UIRotationGestureRecognizer(
    target: self, action: #selector(handleRotation))

  override init(frame: CGRect) {
    super.init(frame: frame)
    clipsToBounds = true
    backgroundColor = UIColor(red: 0.94, green: 0.93, blue: 0.90, alpha: 1)
    accessibilityIdentifier = "campus-atlas"
    art.isUserInteractionEnabled = true
    addSubview(art)
    for gesture in [pan, pinch, rotation] {
      gesture.delegate = self
      addGestureRecognizer(gesture)
    }
  }
  required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

  private var viewportCenter: CGPoint { CGPoint(x: bounds.midX, y: bounds.midY) }
  private var rotatedSize: CGSize {
    let x = abs(cos(angle))
    let y = abs(sin(angle))
    return CGSize(
      width: art.bounds.width * x + art.bounds.height * y,
      height: art.bounds.width * y + art.bounds.height * x)
  }
  private var minimumScale: CGFloat {
    min(bounds.width / rotatedSize.width, bounds.height / rotatedSize.height)
  }
  private var maximumScale: CGFloat { max(minimumScale * 5, 2) }

  override func layoutSubviews() {
    super.layoutSubviews()
    let size = bounds.size
    guard size != previousSize, size.width > 0, size.height > 0 else { return }
    let firstLayout = previousSize == .zero
    let wasFit =
      firstLayout
      || abs(
        scale
          - min(
            previousSize.width / rotatedSize.width,
            previousSize.height / rotatedSize.height)) < 0.001
    if wasFit {
      scale = minimumScale
      mapCenter = viewportCenter
    } else {
      mapCenter.x += (size.width - previousSize.width) / 2
      mapCenter.y += (size.height - previousSize.height) / 2
    }
    previousSize = size
    render()
  }

  private func render(animated: Bool = false) {
    guard bounds.width > 0, bounds.height > 0 else { return }
    scale = max(minimumScale, min(scale, maximumScale))
    let size = rotatedSize
    let x = max(0, (size.width * scale - bounds.width) / 2)
    let y = max(0, (size.height * scale - bounds.height) / 2)
    mapCenter.x = min(bounds.midX + x, max(bounds.midX - x, mapCenter.x))
    mapCenter.y = min(bounds.midY + y, max(bounds.midY - y, mapCenter.y))
    let update = {
      self.art.transform = CGAffineTransform(rotationAngle: self.angle).scaledBy(
        x: self.scale, y: self.scale)
      self.art.center = self.mapCenter
    }
    if animated && !UIAccessibility.isReduceMotionEnabled {
      UIView.animate(
        withDuration: 0.32, delay: 0, options: [.beginFromCurrentState], animations: update)
    } else {
      update()
    }
    accessibilityValue = "\(Int((angle * 180 / .pi).rounded()))°"
  }

  private func transformMap(around pivot: CGPoint, magnification: CGFloat = 1, turn: CGFloat = 0) {
    let position = art.convert(pivot, from: self)
    angle = (angle + turn).truncatingRemainder(dividingBy: 2 * .pi)
    scale = max(minimumScale, min(scale * magnification, maximumScale))
    let local = CGPoint(x: position.x - art.bounds.midX, y: position.y - art.bounds.midY)
    let offset = local.applying(
      CGAffineTransform(rotationAngle: angle).scaledBy(x: scale, y: scale))
    mapCenter = CGPoint(x: pivot.x - offset.x, y: pivot.y - offset.y)
    render()
  }

  func gestureRecognizer(
    _ gestureRecognizer: UIGestureRecognizer,
    shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
  ) -> Bool {
    [pan, pinch, rotation].contains { $0 === otherGestureRecognizer }
  }
  @objc private func handlePan(_ gesture: UIPanGestureRecognizer) {
    guard gesture.state == .changed else { return }
    let delta = gesture.translation(in: self)
    gesture.setTranslation(.zero, in: self)
    mapCenter.x += delta.x
    mapCenter.y += delta.y
    render()
  }
  @objc private func handlePinch(_ gesture: UIPinchGestureRecognizer) {
    guard gesture.state == .changed else { return }
    transformMap(around: gesture.location(in: self), magnification: gesture.scale)
    gesture.scale = 1
  }
  @objc private func handleRotation(_ gesture: UIRotationGestureRecognizer) {
    guard gesture.state == .changed else { return }
    transformMap(around: gesture.location(in: self), turn: gesture.rotation)
    gesture.rotation = 0
  }

  func configure(_ places: [CampusPlace], selected: String?, reset: Int, command: Int) {
    if previousPlaces != places {
      for button in buttons.values { button.removeFromSuperview() }
      buttons.removeAll()
      for p in places {
        let button = UIButton(type: .custom)
        let height = p.height ?? p.size * 0.75
        button.frame = CGRect(
          x: p.x - p.size / 2, y: p.y - height / 2, width: p.size, height: height)
        button.accessibilityLabel = "\(p.name)，\(p.categoryName)，\(p.summary)"
        button.layer.cornerRadius = 8
        button.addAction(UIAction { [weak self] _ in self?.onSelect?(p) }, for: .touchUpInside)
        art.addSubview(button)
        buttons[p.id] = button
      }
      previousPlaces = places
    }
    for (id, button) in buttons {
      button.accessibilityTraits = id == selected ? [.button, .selected] : [.button]
      button.layer.borderWidth = id == selected ? 4 : 0
      button.layer.borderColor = tintColor.cgColor
      button.backgroundColor = id == selected ? tintColor.withAlphaComponent(0.12) : .clear
    }
    if previousReset != reset {
      angle = 0
      scale = minimumScale
      mapCenter = viewportCenter
      render(animated: true)
      previousReset = reset
    }
    if previousCommand != command {
      let factor = command > previousCommand ? 1.35 : 1 / 1.35
      transformMap(around: viewportCenter, magnification: factor)
      previousCommand = command
    }
    if selectedID != selected, let selected, let button = buttons[selected] {
      let target = button.frame.insetBy(dx: -100, dy: -100)
      let x = abs(cos(angle))
      let y = abs(sin(angle))
      scale = min(
        maximumScale,
        max(
          minimumScale,
          min(
            bounds.width / (target.width * x + target.height * y),
            bounds.height / (target.width * y + target.height * x))))
      let offset = CGPoint(x: target.midX - art.bounds.midX, y: target.midY - art.bounds.midY)
        .applying(CGAffineTransform(rotationAngle: angle).scaledBy(x: scale, y: scale))
      mapCenter = CGPoint(x: bounds.midX - offset.x, y: bounds.midY - offset.y)
      render(animated: true)
    }
    selectedID = selected
  }
}
