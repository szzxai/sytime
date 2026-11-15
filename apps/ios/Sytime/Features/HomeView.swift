import SwiftUI

struct HomeView: View {
  @Environment(AppModel.self) private var app
  @Binding var selection: MainTab
  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 28) {
        ZStack(alignment: .bottomLeading) {
          RoundedRectangle(cornerRadius: 30).fill(
            LinearGradient(
              colors: [Color.accentColor.opacity(0.22), Color.accentColor.opacity(0.04)],
              startPoint: .topLeading, endPoint: .bottomTrailing))
          HStack(alignment: .bottom, spacing: 8) {
            VStack(alignment: .leading, spacing: 16) {
              Label("由同学共建 · 为校园而生", systemImage: "leaf").font(.caption).foregroundStyle(.secondary)
              Text("拾起校园\n每一寸时光").font(.system(.largeTitle, design: .serif, weight: .bold))
                .fixedSize(horizontal: false, vertical: true)
              Text("苏州中学最大的校园信息平台").font(.subheadline).foregroundStyle(.secondary)
              Button {
                selection = .campus
              } label: {
                Label("走进苏中", systemImage: "arrow.up.right")
              }.buttonStyle(.glassProminent)
            }.padding(.vertical, 28)
            Spacer(minLength: 0)
            if let image = UIImage(named: "FanZhongyan.png") {
              Image(uiImage: image).resizable().scaledToFit().frame(maxWidth: 140, maxHeight: 260)
                .accessibilityLabel("范仲淹像")
            }
          }.padding(.horizontal, 24)
        }.frame(minHeight: 290)
        SiteBanner()
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 14)], spacing: 14) {
          shortcut("下一餐吃什么", subtitle: "今日与明日的食堂供应", icon: "fork.knife", color: .orange) {
            selection = .food
          }
          shortcut("三元坊必吃榜", subtitle: "同学们推荐的周边小店", icon: "storefront", color: .teal) {
            selection = .shops
          }
          NavigationLink(value: AppRoute.wiki("")) {
            tile("校园 Wiki", subtitle: "由同学共写的校园百科", icon: "books.vertical", color: .brown)
          }.buttonStyle(.plain)
          NavigationLink(value: AppRoute.announcements) {
            tile("更新公告", subtitle: "校园生活的新消息", icon: "megaphone", color: .indigo)
          }.buttonStyle(.plain)
          NavigationLink(value: AppRoute.tickets) {
            tile(
              "一起完善", subtitle: "告诉我们你的建议", icon: "bubble.left.and.text.bubble.right", color: .pink)
          }.buttonStyle(.plain)
        }
        VStack(alignment: .leading, spacing: 12) {
          Text("关于我们").font(.title2.bold())
          Text("「拾光酥糕」是由苏中学子自主构建的校园数字指南。从每日三餐到校园角落，让每一份信息都触手可及。").foregroundStyle(.secondary)
          NavigationLink("了解我们的故事", value: AppRoute.about)
        }
        VStack(alignment: .leading, spacing: 12) {
          Text("开发团队").font(.title2.bold())
          Label("苏州中学人工智能实验室", systemImage: "sparkles")
          Label("苏州中学软件开发社", systemImage: "chevron.left.forwardslash.chevron.right")
        }
        Text("源于热爱，始于代码。\n愿你在这里，找到属于自己的校园时光。").font(.footnote).foregroundStyle(.secondary).padding(
          .vertical)
      }.padding(20).frame(maxWidth: 1050).frame(maxWidth: .infinity)
    }.background(Color(.systemGroupedBackground)).navigationTitle("拾光酥糕")
  }
  private func shortcut(
    _ title: String, subtitle: String, icon: String, color: Color, action: @escaping () -> Void
  ) -> some View {
    Button(action: action) { tile(title, subtitle: subtitle, icon: icon, color: color) }
      .buttonStyle(.plain).accessibilityIdentifier(title)
  }
  private func tile(_ title: String, subtitle: String, icon: String, color: Color) -> some View {
    VStack(alignment: .leading, spacing: 12) {
      Image(systemName: icon).font(.title2).foregroundStyle(color).frame(height: 30)
      Text(title).font(.headline)
      Text(subtitle).font(.caption).foregroundStyle(.secondary).fixedSize(
        horizontal: false, vertical: true)
    }.frame(maxWidth: .infinity, minHeight: 124, alignment: .leading).padding(18).background(
      Color(.secondarySystemGroupedBackground), in: .rect(cornerRadius: 22))
  }
}

struct SiteBanner: View {
  @Environment(AppModel.self) private var app
  @AppStorage("dismissedBanners") private var dismissed = ""
  var body: some View {
    APIContent(path: "/api/settings/banner", authenticated: false) { data in
      let key = "\(app.origin)|\(app.user.id)|\(data["version"].string)"
      if !data["banner"].string.isEmpty && dismissed != key {
        HStack(alignment: .top) {
          Label(data["banner"].string, systemImage: "megaphone").font(.subheadline)
          Spacer()
          Button("关闭提示", systemImage: "xmark") { dismissed = key }.labelStyle(.iconOnly)
        }.padding().background(.tint.opacity(0.08), in: .rect(cornerRadius: 16))
      }
    }
  }
}

struct AboutView: View {
  var body: some View {
    List {
      Section {
        Label("由同学共建，为校园而生", systemImage: "leaf").font(.headline)
        Text("把校园里的信息，放在一个容易找到的地方。")
      }
      Section("从一张地图开始") {
        Text("拾光酥糕的前身是校园信息网。最初，我们只是想做一张方便查找地点的校园地图。随着同学们的使用和反馈，食堂菜谱、周边美食和消息箱陆续来到这里。")
      }
      Section("我们的原则") {
        Label("信息清楚，来源可查", systemImage: "checkmark.seal")
        Label("尊重隐私，认真审核", systemImage: "hand.raised")
        Label("学生共建，持续维护", systemImage: "person.2")
      }
      Section("开发团队") {
        Text("苏州中学人工智能实验室")
        Text("苏州中学软件开发社")
      }
      Section("参与共建") {
        Link("项目源码与问题反馈", destination: URL(string: "https://github.com/szzxai/sytime")!)
        NavigationLink("提交问题与建议", value: AppRoute.tickets)
        Text("开源协议：GNU AGPL v3.0").font(.footnote).foregroundStyle(.secondary)
      }
      Section {
        LabeledContent(
          "版本",
          value:
            "\(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0") (\(Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"))"
        )
      }
    }.navigationTitle("关于拾光酥糕")
  }
}

struct AnnouncementsView: View {
  @State private var selected: JSONValue?
  var body: some View {
    APIContent(path: "/api/announcements", authenticated: false) { data in
      if data["announcements"].array.isEmpty {
        EmptyView(title: "暂无公告", description: "有新动态时会第一时间发布。", icon: "megaphone")
      } else {
        List(data["announcements"].array) { row in
          NavigationLink {
            ScrollView {
              VStack(alignment: .leading, spacing: 20) {
                Text(row["title"].string).font(.largeTitle.bold())
                Text(SytimeDate.display(row["publish_date"])).font(.caption).foregroundStyle(
                  .secondary)
                Text(row["content"].string).textSelection(.enabled)
              }.padding().frame(maxWidth: 800, alignment: .leading).frame(maxWidth: .infinity)
            }.navigationTitle("公告详情").navigationBarTitleDisplayMode(.inline)
          } label: {
            VStack(alignment: .leading, spacing: 8) {
              Text(row["title"].string).font(.headline)
              Text(SytimeDate.display(row["publish_date"])).font(.caption).foregroundStyle(
                .secondary)
            }.padding(.vertical, 6)
          }
        }
      }
    }.navigationTitle("更新公告")
  }
}
