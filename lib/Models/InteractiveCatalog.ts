import { autorun, computed, observable, runInAction, action } from "mobx";
import GeoJsonCatalogItem from "terriajs/lib/Models/GeoJsonCatalogItem";
import CommonStrata from "terriajs/lib/Models/CommonStrata";
import ScreenSpaceEventType from "terriajs-cesium/Source/Core/ScreenSpaceEventType";
import Ellipsoid from "terriajs-cesium/Source/Core/Ellipsoid";
import { featureBelongsToCatalogItem } from "terriajs/lib/Map/PickedFeatures.ts";

const notifyParent = data => {
  if (window.parent !== window) {
    window.parent.postMessage(data, "*");
  }

  if (window.opener) {
    window.opener.postMessage(data, "*");
  }
};
window.x = {
  type: "Feature",
  properties: {
    stroke: "#f3f570",
    "stroke-width": 2,
    "stroke-opacity": 1,
    fill: "#31166f",
    "fill-opacity": 0.5
  },
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [151.88735961914062, -20.484913985405544],
        [152.85964965820315, -21.053744493156334],
        [152.94754028320312, -20.617361003397722],
        [151.9793701171875, -20.29053732272331],
        [151.88735961914062, -20.484913985405544]
      ]
    ]
  }
};
window.y = {
  type: "Feature",
  properties: {
    stroke: "#08ABD5",
    "stroke-width": 2,
    "stroke-opacity": 1
  },
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [151.885986328125, -20.488773287109822],
        [151.36962890625, -22.044913300245675],
        [152.4462890625, -22.512556954051437],
        [152.852783203125, -21.053744493156334],
        [151.885986328125, -20.488773287109822]
      ]
    ]
  }
};

export default class InteractiveCatalog {
  @observable
  items = {};

  private terria = null;
  private cesiumClickHandler = null;

  constructor(terria) {
    this.terria = terria;
    this.setupMessageListeners();
  }

  private setupMessageListeners() {
    window.addEventListener("message", this.messageListener);
  }

  @action.bound
  private messageListener(e) {
    // filter out all webpack, system, other messages
    if (!e.data.interactiveLayer) {
      return;
    }

    switch (e.data.type) {
      case "layer.enable":
        this.enable();
        console.debug("[interactive layer] enabled");
        break;
      case "layer.disable":
        this.disable();
        console.debug("[interactive layer] disabled");
        break;
      case "zone.show":
        {
          const id = e.data.id;
          if (!id) {
            console.warn(
              "[interactive layer] <zone.show> requires an `id` parameter"
            );
            break;
          }
          this.show(id);
        }
        break;
      case "zone.hide":
        {
          const id = e.data.id;
          if (!id) {
            console.warn(
              "[interactive layer] <zone.hide> requires an `id` parameter"
            );
            break;
          }
          this.hide(e.data.id);
        }
        break;
      case "zone.add":
        {
          let items = e.data.items || [];
          if (e.data.item) {
            items.push(e.data.item);
          }
          if (!items.length) {
            console.warn(
              "[interactive layer] <zone.add> requires either `item` or `items` parameter"
            );
            break;
          }
          this.addItems(items);
        }

        break;
    }
  }

  private getCesium() {
    if (!this.terria.cesium) {
      console.warn("CesiumWidget is not ready yet");
      return;
    }
    return this.terria.cesium;
  }

  enable() {
    if (this.cesiumClickHandler) {
      return;
    }
    const cesium = this.getCesium();
    if (!cesium) {
      return;
    }

    const handler = cesium.cesiumWidget.screenSpaceEventHandler;

    this.cesiumClickHandler = handler.getInputAction(
      ScreenSpaceEventType.LEFT_CLICK
    );
    handler.setInputAction(e => {
      const features = cesium.pickVectorFeatures(e.position);
      const items = this.terria.workbench.items.filter(
        item =>
          features.filter(feature => featureBelongsToCatalogItem(feature, item))
            .length
      );

      const ids = items.map(item => item.uniqueId);
      notifyParent({ type: "click", ids });
    }, ScreenSpaceEventType.LEFT_CLICK);
  }

  disable() {
    if (!this.cesiumClickHandler) {
      return;
    }
    const cesium = this.getCesium();
    if (!cesium) {
      return;
    }

    const handler = cesium.cesiumWidget.screenSpaceEventHandler;
    handler.setInputAction(
      this.cesiumClickHandler,
      ScreenSpaceEventType.LEFT_CLICK
    );
    this.cesiumClickHandler = null;
  }

  async addItems(items) {
    for (let { id, feature, name } of items) {
      if (!id || !feature) {
        console.warn("Catalog item must contain id and feature definition");
        continue;
      }
      if (this.items[id]) {
        console.warn(`Item with id ${id} already exists in catalog.`);
        continue;
      }
      let item = new GeoJsonCatalogItem(id, this.terria);
      item.setTrait(CommonStrata.user, "geoJsonData", feature);
      item.setTrait(CommonStrata.user, "show", false);
      item.setTrait(CommonStrata.user, "name", name || id);
      await this.terria.workbench.add(item);
      this.items[id] = item;
    }
  }

  @action
  setVisibility(id, isVisible) {
    const item = this.items[id];
    if (!item) {
      console.warn(`Catalog item ${id} does not exists`);
      return;
    }
    item.setTrait(CommonStrata.user, "show", isVisible);
  }

  @action
  show(id) {
    this.setVisibility(id, true);
  }

  @action
  hide(id) {
    this.setVisibility(id, false);
  }
}

// iframe.addEventListener('message', m => console.log('New incomming message: %o', m))

// iframe.postMessage({interactiveLayer: true, type: 'layer.enable'})
// iframe.postMessage({interactiveLayer: true, type: 'layer.disable'})
// iframe.postMessage({interactiveLayer: true, type: 'zone.add', item: {id:'zone-2', feature: y}})
// iframe.postMessage({interactiveLayer: true, type: 'zone.show', id: 'zone-2'})
// iframe.postMessage({interactiveLayer: true, type: 'zone.hide', id: 'zone-2'})
