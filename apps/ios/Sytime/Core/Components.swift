import PhotosUI
import SwiftUI

@MainActor @Observable
final class Resource {
  var value: JSONValue = .null
  var error: String?
  var loading = false
  private var generation = 0
  func load(_ api: APIClient, _ path: String, authenticated: Bool = true) async {
    generation += 1
    let current = generation
    loading = true
    error = nil
    do {
      let result = try await api.request(path, authenticated: authenticated)
      guard generation == current else { return }
      guard !Task.isCancelled else {
        loading = false
        return
      }
      value = result
    } catch {
      guard generation == current else { return }
      if !(error is CancellationError), (error as? URLError)?.code != .cancelled {
        self.error = error.localizedDescription
      }
    }
    if generation == current { loading = false }
  }
}

struct APIContent<Content: View>: View {
  @Environment(AppModel.self) private var app
  let path: String
  var authenticated = true
  @ViewBuilder let content: (JSONValue) -> Content
  @State private var resource = Resource()
  @State private var loadedSession: Int?
  var body: some View {
    Group {
      if resource.value.isNull {
        if let error = resource.error {
          FailureView(message: error) { await load() }
        } else {
          ProgressView("正在加载…").frame(maxWidth: .infinity, maxHeight: .infinity)
        }
      } else {
        content(resource.value)
          .safeAreaInset(edge: .top, spacing: 0) {
            if let error = resource.error { RetryBanner(message: error) { await load() } }
          }
      }
    }
    .task(id: "\(app.sessionRevision):\(path)") {
      if loadedSession != app.sessionRevision {
        resource = Resource()
        loadedSession = app.sessionRevision
      }
      await load()
    }
    .refreshable { await load() }
  }
  private func load() async { await resource.load(app.api, path, authenticated: authenticated) }
}

struct FailureView: View {
  let message: String
  let retry: () async -> Void
  var body: some View {
    ContentUnavailableView {
      Label("暂时无法加载", systemImage: "wifi.exclamationmark")
    } description: {
      Text(message)
    } actions: {
      Button("重试") { Task { await retry() } }.buttonStyle(.glassProminent)
    }
  }
}
struct RetryBanner: View {
  let message: String
  let retry: () async -> Void
  var body: some View {
    HStack {
      Text(message).font(.footnote)
      Spacer()
      Button("重试") { Task { await retry() } }
    }
    .padding().background(.regularMaterial)
  }
}

struct EmptyView: View {
  let title: String
  var description = "有新内容时会在这里显示。"
  var icon = "tray"
  var body: some View {
    ContentUnavailableView(title, systemImage: icon, description: Text(description))
  }
}

struct RatingView: View {
  let value: JSONValue
  var count: Int? = nil
  var body: some View {
    HStack(spacing: 4) {
      Image(systemName: "star.fill").foregroundStyle(.orange)
      if let rating = value.double {
        Text(rating, format: .number.precision(.fractionLength(1)))
      } else {
        Text("暂无评分")
      }
      if let count { Text("· \(count) 条评价").foregroundStyle(.secondary) }
    }.font(.subheadline).accessibilityElement(children: .combine)
  }
}

struct RemotePicture: View {
  @Environment(AppModel.self) private var app
  let path: String
  var fit = false
  var label = "配图"
  @State private var image: UIImage?
  @State private var failed = false
  @State private var fullscreen = false
  var body: some View {
    Group {
      if let image {
        Image(uiImage: image).resizable().aspectRatio(contentMode: fit ? .fit : .fill)
          .onTapGesture { fullscreen = true }
      } else {
        Rectangle().fill(.quaternary).overlay {
          if failed {
            Image(systemName: "photo.badge.exclamationmark").foregroundStyle(.secondary)
          } else {
            ProgressView()
          }
        }
      }
    }.clipped().accessibilityLabel(label)
      .task(id: "\(app.sessionRevision):\(path)") {
        image = nil
        failed = false
        do {
          // Only relative, same-origin media may receive the session credential.
          if path.hasPrefix("data:image/"),
            let encoded = path.split(separator: ",", maxSplits: 1).last,
            let data = Data(base64Encoded: String(encoded))
          {
            image = UIImage(data: data)
            return
          }
          guard let url = try? app.api.url(path) else {
            failed = true
            return
          }
          var request = URLRequest(url: url)
          if let token = app.api.token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
          }
          let (data, response) = try await app.api.session.data(for: request)
          guard (response as? HTTPURLResponse)?.statusCode == 200 else {
            failed = true
            return
          }
          image = UIImage(data: data)
          failed = image == nil
        } catch { if !Task.isCancelled { failed = true } }
      }
      .fullScreenCover(isPresented: $fullscreen) {
        NavigationStack {
          ZStack {
            Color.black.ignoresSafeArea()
            if let image { ZoomablePicture(image: image).accessibilityLabel(label) }
          }
          .toolbar {
            ToolbarItem(placement: .confirmationAction) { Button("完成") { fullscreen = false } }
          }
        }
      }
  }
}

struct PersonLabel: View {
  let user: JSONValue
  var body: some View {
    HStack(spacing: 10) {
      if user["avatar_url"].string.isEmpty {
        Image(systemName: "person.crop.circle.fill").font(.title).foregroundStyle(.secondary)
      } else {
        RemotePicture(path: user["avatar_url"].string, label: "头像").frame(width: 36, height: 36)
          .clipShape(.circle)
      }
      VStack(alignment: .leading, spacing: 3) {
        Text(user.text("nickname", user.text("username", "同学"))).fontWeight(.medium)
        HStack {
          if user["show_role"] != .number(0), let role = roleNames[user["role"].string] {
            Text(role)
          }
          let title = user["user_title"].isNull ? user["title"] : user["user_title"]
          if !title["name"].string.isEmpty { Text(title["name"].string).foregroundStyle(.tint) }
        }.font(.caption).foregroundStyle(.secondary)
      }
    }
  }
}

struct ReviewCard: View {
  let review: JSONValue
  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      NavigationLink(value: AppRoute.profile(review["user_id"].int)) { PersonLabel(user: review) }
        .buttonStyle(.plain)
      HStack {
        RatingView(value: review["rating"])
        Spacer()
        Text(
          SytimeDate.display(
            review["updated_at"].isNull ? review["created_at"] : review["updated_at"])
        ).font(.caption).foregroundStyle(.secondary)
      }
      let text = review.text("comment", review["content"].string)
      if !text.isEmpty { Text(text).textSelection(.enabled) }
      if let guests = review["guests"].double, guests > 0, let total = review["total_price"].double
      {
        Text(
          "\(Int(guests)) 人用餐 · 共 \(money(.number(total))) · 人均 \(money(.number(total / guests)))"
        ).font(.caption).foregroundStyle(.secondary)
      }
      if !review["image_url"].string.isEmpty {
        RemotePicture(path: review["image_url"].string, fit: true).frame(maxHeight: 280).clipShape(
          .rect(cornerRadius: 12))
      }
    }.padding(.vertical, 8)
  }
}

struct PagedReviews: View {
  @Environment(AppModel.self) private var app
  let path: String
  var collection = "reviews"
  @State private var rows: [JSONValue] = []
  @State private var more = true
  @State private var loading = false
  @State private var error: String?
  var body: some View {
    ForEach(rows) { ReviewCard(review: $0) }
    if let error {
      Text(error).foregroundStyle(.red)
      Button("重试") { Task { await load() } }
    } else if rows.isEmpty && !loading {
      Text("还没有评价，吃过后分享你的感受吧。").foregroundStyle(.secondary)
    }
    if more { Button(loading ? "正在加载…" : "加载更多评价") { Task { await load() } }.disabled(loading) }
    Color.clear.frame(height: 0).task(id: "\(app.sessionRevision):\(path)") {
      rows = []
      more = true
      await load()
    }
  }
  private func load() async {
    guard !loading else { return }
    loading = true
    error = nil
    do {
      let result = try await app.api.request(
        APIClient.path(path, query: ["offset": String(rows.count), "limit": "20"]))
      let next = result[collection].array
      guard !Task.isCancelled else {
        loading = false
        return
      }
      rows += next.filter { row in !rows.contains { $0.id == row.id } }
      more = result["has_more"].isNull ? next.count == 20 : result["has_more"].flag
    } catch { if !Task.isCancelled { self.error = error.localizedDescription } }
    loading = false
  }
}

struct PhotoField: View {
  @Binding var data: Data?
  @State private var selection: PhotosPickerItem?
  @State private var error: String?
  @State private var preparing = false
  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      PhotosPicker(selection: $selection, matching: .images) {
        Label(data == nil ? "选择图片（可选）" : "更换图片", systemImage: "photo.badge.plus")
      }.disabled(preparing)
      if preparing { ProgressView("正在压缩图片…") }
      if let data, let image = UIImage(data: data) {
        Image(uiImage: image).resizable().scaledToFit().frame(maxHeight: 180).clipShape(
          .rect(cornerRadius: 12))
        Button("移除图片", role: .destructive) {
          self.data = nil
          selection = nil
        }
      }
      if let error { Text(error).font(.caption).foregroundStyle(.red) }
    }
    .task(id: selection) {
      guard let selection else { return }
      preparing = true
      defer { preparing = false }
      do {
        guard let raw = try await selection.loadTransferable(type: Data.self),
          let image = UIImage(data: raw)
        else { throw APIError(status: 0, payload: .strings(["error": "这张图片无法读取，请重新选择"])) }
        let ratio = min(1, 1600 / max(image.size.width, image.size.height))
        let size = CGSize(width: image.size.width * ratio, height: image.size.height * ratio)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        let resized = UIGraphicsImageRenderer(size: size, format: format).image { context in
          UIColor.white.setFill()
          context.fill(CGRect(origin: .zero, size: size))
          image.draw(in: CGRect(origin: .zero, size: size))
        }
        guard let jpeg = resized.jpegData(compressionQuality: 0.78), jpeg.count <= 2 * 1024 * 1024
        else { throw APIError(status: 413, payload: .null) }
        self.data = jpeg
        error = nil
      } catch { self.error = error.localizedDescription }
    }
  }
}

struct ZoomablePicture: UIViewRepresentable {
  let image: UIImage
  func makeUIView(context: Context) -> PictureScrollView { PictureScrollView(image: image) }
  func updateUIView(_ uiView: PictureScrollView, context: Context) {}
}

final class PictureScrollView: UIScrollView, UIScrollViewDelegate {
  private let picture: UIImageView
  private var previousSize = CGSize.zero
  init(image: UIImage) {
    picture = UIImageView(image: image)
    super.init(frame: .zero)
    backgroundColor = .black
    delegate = self
    showsVerticalScrollIndicator = false
    showsHorizontalScrollIndicator = false
    picture.frame = CGRect(origin: .zero, size: image.size)
    addSubview(picture)
    contentSize = image.size
    let tap = UITapGestureRecognizer(target: self, action: #selector(doubleTap(_:)))
    tap.numberOfTapsRequired = 2
    addGestureRecognizer(tap)
    accessibilityHint = "双指缩放或双击放大图片"
  }
  required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
  override func layoutSubviews() {
    super.layoutSubviews()
    if bounds.size != previousSize, bounds.width > 0, bounds.height > 0 {
      previousSize = bounds.size
      minimumZoomScale = min(
        bounds.width / picture.bounds.width, bounds.height / picture.bounds.height)
      maximumZoomScale = max(minimumZoomScale * 6, 2)
      zoomScale = minimumZoomScale
    }
    picture.center = CGPoint(
      x: max(contentSize.width, bounds.width) / 2, y: max(contentSize.height, bounds.height) / 2)
  }
  func viewForZooming(in scrollView: UIScrollView) -> UIView? { picture }
  func scrollViewDidZoom(_ scrollView: UIScrollView) { setNeedsLayout() }
  @objc private func doubleTap(_ gesture: UITapGestureRecognizer) {
    if zoomScale > minimumZoomScale * 1.2 {
      setZoomScale(minimumZoomScale, animated: !UIAccessibility.isReduceMotionEnabled)
    } else {
      let scale = min(maximumZoomScale, minimumZoomScale * 3)
      let point = gesture.location(in: picture)
      zoom(
        to: CGRect(
          x: point.x - bounds.width / scale / 2, y: point.y - bounds.height / scale / 2,
          width: bounds.width / scale, height: bounds.height / scale),
        animated: !UIAccessibility.isReduceMotionEnabled)
    }
  }
}
