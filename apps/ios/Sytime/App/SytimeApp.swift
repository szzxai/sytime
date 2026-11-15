import SwiftUI

@main
struct SytimeApp: App {
  @State private var model = AppModel()
  @AppStorage("appearance") private var appearance = "system"
  var body: some Scene {
    WindowGroup {
      RootView().environment(model)
        .preferredColorScheme(appearance == "system" ? nil : appearance == "dark" ? .dark : .light)
    }
  }
}

enum MainTab: String, CaseIterable, Identifiable {
  case home, campus, food, shops, account
  var id: String { rawValue }
  var title: String {
    switch self {
    case .home: "拾光"
    case .campus: "校园"
    case .food: "食谱"
    case .shops: "周边"
    case .account: "我的"
    }
  }
  var icon: String {
    switch self {
    case .home: "sun.horizon"
    case .campus: "map"
    case .food: "fork.knife"
    case .shops: "storefront"
    case .account: "person.crop.circle"
    }
  }
}

struct RootView: View {
  @Environment(AppModel.self) private var app
  @Environment(\.scenePhase) private var scenePhase
  @State private var tab: MainTab = .home
  @State private var initialPreferenceApplied = false
  var body: some View {
    @Bindable var app = app
    TabView(selection: $tab) {
      ForEach(MainTab.allCases) { item in
        Tab(item.title, systemImage: item.icon, value: item) {
          NavigationStack {
            Group {
              switch item {
              case .home: HomeView(selection: $tab)
              case .campus: CampusView()
              case .food: FoodView()
              case .shops: ShopsView()
              case .account: AccountView()
              }
            }
            .navigationDestination(for: AppRoute.self) { RouteView(route: $0) }
            .toolbar {
              if item != .account {
                ToolbarItem(placement: .topBarTrailing) {
                  Button {
                    app.pendingRoute = app.isLoggedIn ? .inbox : nil
                    if !app.isLoggedIn { app.showLogin = true }
                  } label: {
                    Label(
                      app.unreadCount > 0 ? "消息，\(min(app.unreadCount, 99)) 条未读" : "消息",
                      systemImage: app.unreadCount > 0 ? "bell.badge" : "bell")
                  }
                }
              }
            }
          }
        }
      }
    }
    .tabViewStyle(.sidebarAdaptable)
    .safeAreaInset(edge: .top, spacing: 0) {
      if app.isOffline {
        Label("网络已断开，部分功能暂不可用", systemImage: "wifi.slash").font(.footnote).frame(
          maxWidth: .infinity
        ).padding(8).background(.regularMaterial)
      }
    }
    .sheet(isPresented: $app.showLogin) { NavigationStack { LoginView() } }
    .sheet(isPresented: $app.showConnection) { NavigationStack { ConnectionView() } }
    .sheet(item: $app.pendingRoute) { route in
      NavigationStack {
        RouteView(route: route).navigationDestination(for: AppRoute.self) { RouteView(route: $0) }
          .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("关闭") { app.pendingRoute = nil } }
          }
      }
    }
    .alert(
      "拾光酥糕", isPresented: Binding(get: { app.notice != nil }, set: { if !$0 { app.notice = nil } })
    ) {
      Button("好", role: .cancel) { app.notice = nil }
    } message: {
      Text(app.notice ?? "")
    }
    .task(id: app.sessionRevision) {
      await app.refreshAccount()
      if !initialPreferenceApplied && app.isLoggedIn {
        initialPreferenceApplied = true
        switch app.user["default_page"].string {
        case "map.html": tab = .campus
        case "recipe.html": tab = .food
        default: break
        }
      }
    }
    .task {
      while !Task.isCancelled {
        try? await Task.sleep(for: .seconds(60))
        if Task.isCancelled { break }
        if scenePhase == .active { await app.refreshAccount() }
      }
    }
    .onChange(of: scenePhase) { _, phase in
      if phase == .active { Task { await app.refreshAccount() } }
    }
    .onOpenURL { url in if let route = AppRoute.parse(url) { app.pendingRoute = route } }
  }
}

struct RouteView: View {
  @Environment(AppModel.self) private var app
  let route: AppRoute
  var body: some View {
    Group {
      switch route {
      case .wiki(let query): WikiView(initialQuery: query)
      case .wikiEntry(let id): WikiEntryView(id: id)
      case .dish(let id): DishDetailView(id: id)
      case .shop(let id): ShopDetailView(id: id)
      case .profile(let id): ProfileView(userID: id)
      case .announcements: AnnouncementsView()
      case .about: AboutView()
      case .settings: SettingsView()
      case .inbox: ProtectedView { InboxView() }
      case .collections: ProtectedView { CollectionsView() }
      case .collection(let id, let own): CollectionDetailView(id: id, own: own)
      case .submissions: ProtectedView { SubmissionsView() }
      case .submission(let id): ProtectedView { SubmissionsView(focusedID: id) }
      case .titles: ProtectedView { TitlesView() }
      case .tickets: ProtectedView { TicketsView() }
      case .admin:
        ProtectedView {
          if app.isStaff {
            AdminView()
          } else {
            EmptyView(title: "无权访问", description: "管理功能仅对管理员与运营者开放。", icon: "lock")
          }
        }
      case .adminRequest(let id):
        ProtectedView {
          if app.isStaff {
            AdminReviewDetailView(id: id)
          } else {
            EmptyView(title: "无权访问", icon: "lock")
          }
        }
      case .adminTickets:
        ProtectedView {
          if app.isStaff { AdminTicketsView() } else { EmptyView(title: "无权访问", icon: "lock") }
        }
      }
    }
  }
}

struct ProtectedView<Content: View>: View {
  @Environment(AppModel.self) private var app
  @ViewBuilder let content: () -> Content
  var body: some View {
    if app.isLoggedIn {
      content()
    } else {
      ContentUnavailableView {
        Label("登录后继续", systemImage: "person.crop.circle")
      } description: {
        Text("登录以管理账号、收藏、申请与消息。")
      } actions: {
        Button("登录") { app.showLogin = true }.buttonStyle(.glassProminent)
      }
    }
  }
}
