const formatDistance = (n) => (n >= 1000 ? (n / 1000).toFixed(1) + ' 千米' : n + ' 米');
const formatMinutes = (n) => n + ' 分钟';
import { ShopInteractiveMap } from './interactive';
/* ==========================================================================
   三元坊必吃榜 · shops-map.js
   高德地图（AMap JS API 2.0）：按需加载、店铺标记、范围多边形、步行路线。
   key 由后端从环境变量注入页面运行时；请在高德控制台限制可用域名与服务。
   坐标采用 GCJ-02（高德坐标系）；area.polygon 的点按 [纬度, 经度] 录入。
   ========================================================================== */
export const ShopsMap = (() => {
  'use strict';

  var TYPE_HUES = {
    面馆: 'teal',
    小吃: 'ochre',
    饮品: 'wisteria',
    快餐: 'indigo',
    甜点: 'rose',
    正餐: 'vermilion',
  };
  var HUE_COLORS = {
    teal: '#085628',
    vermilion: '#B8372B',
    ochre: '#8A5A00',
    bamboo: '#2F7D4F',
    wisteria: '#5E4FA2',
    indigo: '#3B5BA5',
    rose: '#A8365F',
    stone: '#5B6468',
  };
  var ANCHORS = [{ key: 'campus', label: '苏州中学本部' }];
  var loading = null;

  function esc(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function parseDistance(value) {
    if (typeof value === 'number' && isFinite(value)) return Math.round(value);
    var match = String(value === null || value === undefined ? '' : value).match(
      /([\d.]+)\s*(公里|千米|km|米|m)?/i,
    );
    if (!match) return null;
    var n = parseFloat(match[1]);
    if (!isFinite(n)) return null;
    return /公里|千米|km/i.test(match[2] || '') ? Math.round(n * 1000) : Math.round(n);
  }

  function parseDuration(value) {
    if (typeof value === 'number' && isFinite(value)) return Math.max(1, Math.round(value / 60));
    var text = String(value === null || value === undefined ? '' : value).trim();
    var hours = text.match(/([\d.]+)\s*(小时|时|h)/i);
    var minutes = text.match(/([\d.]+)\s*(分钟|分|min)/i);
    if (hours || minutes)
      return Math.max(
        1,
        Math.round((hours ? Number(hours[1]) * 60 : 0) + (minutes ? Number(minutes[1]) : 0)),
      );
    var plain = Number(text);
    return isFinite(plain) && plain > 0 ? Math.max(1, Math.round(plain)) : null;
  }

  function pointOf(shop) {
    var lat = Number(shop && shop.lat);
    var lng = Number(shop && shop.lng);
    return isFinite(lat) && isFinite(lng) ? { lat: lat, lng: lng } : null;
  }

  function latLng(point) {
    return [point.lng, point.lat];
  }
  function worldPixel(point, zoom) {
    var scale = 256 * Math.pow(2, zoom);
    var sin = Math.sin((point.lat * Math.PI) / 180);
    return {
      x: ((point.lng + 180) / 360) * scale,
      y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
    };
  }

  var M = {
    anchors: ANCHORS,
    hue: function (type) {
      return TYPE_HUES[type] || 'stone';
    },
    color: function (hue) {
      return HUE_COLORS[hue] || HUE_COLORS.stone;
    },
    colorForType: function (type) {
      return M.color(M.hue(type));
    },
    parseDistance: parseDistance,
    parseDuration: parseDuration,
    typeLegend: function (types) {
      return (types || []).map(function (type) {
        return { type: type, hue: M.hue(type), color: M.colorForType(type) };
      });
    },

    /* 按需加载 AMap JS API。浏览器端 key 必然可见，请限制来源域名。 */
    load: function (key, securityCode) {
      if (window.AMap && window.AMap.Map) return Promise.resolve(window.AMap);
      if (loading) return loading;
      loading = new Promise(function (resolve, reject) {
        if (!key) {
          loading = null;
          reject(new Error('missing-key'));
          return;
        }
        var settled = false;
        if (securityCode) window._AMapSecurityConfig = { securityJsCode: securityCode };
        window.__szzxAMapReady = function () {
          settled = true;
          if (window.AMap) resolve(window.AMap);
          else {
            loading = null;
            reject(new Error('api-unavailable'));
          }
        };
        var script = document.createElement('script');
        script.src =
          'https://webapi.amap.com/maps?v=2.0&key=' +
          encodeURIComponent(key) +
          '&callback=__szzxAMapReady';
        script.async = true;
        script.onerror = function () {
          if (settled) return;
          loading = null;
          reject(new Error('script-error'));
        };
        setTimeout(function () {
          if (settled || (window.AMap && window.AMap.Map)) return;
          loading = null;
          reject(new Error('timeout'));
        }, 10000);
        document.head.appendChild(script);
      });
      return loading;
    },

    /* Secure static AMap fallback: the Web Service Key stays server-side, marker links stay interactive. */
    renderStatic: function (el, config) {
      var conf = config || {};
      if (ShopInteractiveMap) {
        return { ok: true, map: ShopInteractiveMap.render(el, conf), static: true };
      }
      var center = conf.center;
      if (!center) return { ok: false, markers: 0, message: '地图中心未配置' };
      var width = 750;
      var height = 420;
      var zoom = Number(center.zoom) || 16;
      var origin = worldPixel({ lat: Number(center.lat), lng: Number(center.lng) }, zoom);
      function pixel(lat, lng) {
        var p = worldPixel({ lat: Number(lat), lng: Number(lng) }, zoom);
        return { x: width / 2 + p.x - origin.x, y: height / 2 + p.y - origin.y };
      }
      el.innerHTML = '';
      el.classList.remove('shop-map--fallback');
      el.classList.add('shop-map--static');
      var frame = document.createElement('div');
      frame.className = 'shop-static-map';
      var image = document.createElement('img');
      image.className = 'shop-static-map__image';
      image.src = '/api/shops/map-image';
      image.alt = '高德地图底图，显示苏州中学周边店铺位置';
      image.width = width;
      image.height = height;
      frame.appendChild(image);
      var polygon = conf.area && conf.area.polygon;
      if (Array.isArray(polygon) && polygon.length >= 3) {
        var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'shop-static-map__area');
        svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
        svg.setAttribute('preserveAspectRatio', 'none');
        svg.setAttribute('aria-hidden', 'true');
        var shape = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        shape.setAttribute(
          'points',
          polygon
            .map(function (pair) {
              var xy = pixel(pair[0], pair[1]);
              return xy.x.toFixed(1) + ',' + xy.y.toFixed(1);
            })
            .join(' '),
        );
        svg.appendChild(shape);
        frame.appendChild(svg);
      }
      var markers = document.createElement('div');
      markers.className = 'shop-static-map__markers';
      markers.setAttribute('role', 'group');
      markers.setAttribute('aria-label', '地图店铺标记');
      var visible = 0;
      (conf.shops || []).filter(pointOf).forEach(function (shop) {
        var pt = pixel(shop.lat, shop.lng);
        if (pt.x < -12 || pt.x > width + 12 || pt.y < -12 || pt.y > height + 12) return;
        var marker;
        if (/^\d+$/.test(String(shop.id))) {
          marker = document.createElement('a');
          marker.href = 'shop.html?id=' + encodeURIComponent(shop.id);
          marker.setAttribute('aria-label', shop.name + '，' + shop.type + '，查看详情');
        } else {
          marker = document.createElement('span');
          marker.setAttribute('role', 'img');
          marker.setAttribute('aria-label', shop.name || '苏州中学本部');
        }
        marker.className =
          'shop-static-map__marker' +
          (String(shop.id).indexOf('anchor-') === 0 ? ' shop-static-map__marker--campus' : '');
        marker.title = shop.name || '苏州中学本部';
        marker.style.left = ((pt.x / width) * 100).toFixed(3) + '%';
        marker.style.top = ((pt.y / height) * 100).toFixed(3) + '%';
        marker.style.setProperty('--marker-color', M.colorForType(shop.type));
        marker.innerHTML =
          '<span aria-hidden="true"></span>' +
          (/^\d+$/.test(String(shop.id))
            ? '<span class="sr-only">' + esc(shop.name) + '</span>'
            : '');
        markers.appendChild(marker);
        visible += 1;
      });
      frame.appendChild(markers);
      el.appendChild(frame);
      return { ok: true, markers: visible, map: null, static: true };
    },

    /* 创建交互 JS API 底图、范围和标记；没有中心点时以苏中地址地理编码定位。 */
    render: function (el, config) {
      var conf = config || {};
      var shops = (conf.shops || []).filter(pointOf);
      var center = conf.center || null;
      var AMap = window.AMap;
      if (!AMap || !AMap.Map) return { ok: false, map: null, message: '高德地图脚本未加载' };

      var map;
      try {
        var initial = center
          ? [center.lng, center.lat]
          : shops.length
            ? [shops[0].lng, shops[0].lat]
            : [120.62, 31.3];
        map = new AMap.Map(el, {
          viewMode: '2D',
          zoom: Number(center && center.zoom) || 16,
          center: initial,
          resizeEnable: true,
        });
        if (AMap.Scale) map.addControl(new AMap.Scale());
        if (AMap.ToolBar) map.addControl(new AMap.ToolBar({ position: 'RB' }));
      } catch (err) {
        return { ok: false, map: null, message: '高德地图初始化失败' };
      }

      var polygon = conf.area && conf.area.polygon;
      if (Array.isArray(polygon) && polygon.length >= 3) {
        try {
          var areaOverlay = new AMap.Polygon({
            path: polygon.map(function (pair) {
              return [pair[1], pair[0]];
            }),
            strokeColor: '#085628',
            strokeWeight: 2,
            strokeOpacity: 0.8,
            fillColor: '#085628',
            fillOpacity: 0.06,
          });
          map.add(areaOverlay);
          map.__szzxArea = areaOverlay;
        } catch (err) {
          /* Invalid polygon does not prevent map markers. */
        }
      }

      M.update(map, shops, conf);
      if (!center && !shops.length && AMap.Geocoder) {
        try {
          new AMap.Geocoder({ city: '苏州市' }).getLocation(
            '苏州市姑苏区人民路699号 苏州中学本部',
            function (status, result) {
              if (status === 'complete' && result && result.geocodes && result.geocodes[0]) {
                map.setCenter(result.geocodes[0].location);
                map.setZoom(16);
              }
            },
          );
        } catch (err) {
          /* Keep a Suzhou fallback center. */
        }
      } else if (!center && !shops.length && AMap.plugin) {
        AMap.plugin('AMap.Geocoder', function () {
          if (!AMap.Geocoder) return;
          new AMap.Geocoder({ city: '苏州市' }).getLocation(
            '苏州市姑苏区人民路699号 苏州中学本部',
            function (status, result) {
              if (status === 'complete' && result && result.geocodes && result.geocodes[0])
                map.setCenter(result.geocodes[0].location);
            },
          );
        });
      }
      return { ok: true, map: map, markers: shops.length, message: '' };
    },

    /* 更新标记而保留底图与范围。 */
    update: function (map, shops, config) {
      if (map && map.__staticInteractiveMap && typeof map.setShops === 'function') {
        map.setShops(shops || []);
        return;
      }
      var AMap = window.AMap;
      if (!map || !AMap) return { ok: false, markers: 0 };
      (map.__szzxMarkers || []).forEach(function (marker) {
        try {
          map.remove(marker);
        } catch (err) {
          /* ignore */
        }
      });
      map.__szzxMarkers = [];
      var list = (shops || []).filter(pointOf);
      list.forEach(function (shop) {
        var point = pointOf(shop);
        var marker = new AMap.Marker({
          position: latLng(point),
          title: shop.name,
          offset: new AMap.Pixel(-10, -10),
          content:
            '<span aria-hidden="true" style="display:block;width:18px;height:18px;border-radius:50%;background:' +
            M.colorForType(shop.type) +
            ';border:3px solid #fff;box-shadow:0 1px 5px #24333a88"></span>',
        });
        marker.on('click', function () {
          var info = new AMap.InfoWindow({
            content: M.infoHtml(shop),
            offset: new AMap.Pixel(0, -14),
            autoMove: true,
          });
          info.open(map, marker.getPosition());
        });
        map.add(marker);
        map.__szzxMarkers.push(marker);
      });
      if (map.__szzxMarkers.length) {
        try {
          map.setFitView(map.__szzxMarkers, false, [36, 36, 36, 36], 16);
        } catch (err) {
          /* ignore */
        }
      }
      return { ok: true, markers: list.length, area: (config || {}).area || null };
    },

    infoHtml: function (shop) {
      var rows = M.distanceRows(shop)
        .map(function (row) {
          return (
            '<div class="map-info__row"><span class="map-info__label">' +
            esc(row.label) +
            '</span><span class="map-info__value">' +
            esc(row.text) +
            '</span></div>'
          );
        })
        .join('');
      var detailLink = /^\d+$/.test(String(shop.id))
        ? '<a class="map-info__link" data-shop-link href="shop.html?id=' +
          encodeURIComponent(shop.id) +
          '">查看店铺详情</a>'
        : '';
      return (
        '<div class="map-info"><div class="map-info__head"><span class="tag" data-hue="' +
        M.hue(shop.type) +
        '">' +
        esc(shop.type) +
        '</span><strong class="map-info__title">' +
        esc(shop.name) +
        '</strong></div><div class="map-info__addr">' +
        esc(shop.address) +
        '</div>' +
        rows +
        detailLink +
        '</div>'
      );
    },

    distanceRows: function (shop) {
      var metro = shop.metro_station
        ? shop.metro_station + (shop.metro_exit ? ' ' + shop.metro_exit : '')
        : '最近地铁站出口';
      return [
        { label: '距北门', text: M.walkText(shop.north_gate_distance_m, shop.north_gate_walk_min) },
        { label: '距东大门', text: M.walkText(shop.east_gate_distance_m, shop.east_gate_walk_min) },
        { label: metro, text: M.walkText(shop.metro_distance_m, shop.metro_walk_min) },
      ];
    },

    walkText: function (meters, minutes) {
      var distance = formatDistance(meters);
      var time = formatMinutes(minutes);
      return distance + ' · 步行 ' + time;
    },

    link: function (shop) {
      var point = pointOf(shop);
      if (point) {
        return (
          'https://uri.amap.com/marker?position=' +
          point.lng +
          ',' +
          point.lat +
          '&name=' +
          encodeURIComponent(shop.name || '') +
          '&coordinate=gaode&callnative=0'
        );
      }
      return (
        'https://uri.amap.com/search?keyword=' +
        encodeURIComponent((shop && shop.name) || '') +
        '&city=' +
        encodeURIComponent('苏州市')
      );
    },

    /* 高德 Walking 插件返回 distance（米）和 time（秒）；查询方向为校门到店铺。 */
    walk: function (map, from, to) {
      return new Promise(function (resolve, reject) {
        var AMap = window.AMap;
        if (!AMap || !AMap.plugin) {
          reject(new Error('unsupported'));
          return;
        }
        AMap.plugin('AMap.Walking', function () {
          if (!AMap.Walking) {
            reject(new Error('unsupported'));
            return;
          }
          var walking;
          try {
            walking = new AMap.Walking(map ? { map: map, panel: undefined } : {});
          } catch (err) {
            reject(new Error('init'));
            return;
          }
          walking.search(latLng(from), latLng(to), function (status, result) {
            if (status !== 'complete' || !result || !result.routes || !result.routes.length) {
              reject(new Error('no-route'));
              return;
            }
            var route = result.routes[0];
            var meters = parseDistance(route.distance);
            var minutes = parseDuration(route.time);
            if (meters === null || minutes === null) {
              reject(new Error('parse'));
              return;
            }
            resolve({ meters: meters, minutes: minutes });
          });
        });
      });
    },
  };
  return M;
})();
