define([
    "dojo/_base/declare",
    "dojo/_base/lang",
    "dijit/_WidgetBase",
    "dijit/_OnDijitClickMixin",
    "dijit/_TemplatedMixin",
    "dojo/on",
    // load template
    "dojo/text!./templates/LayerSwipe.html",
    "dojo/i18n!./nls/LayerSwipe",
    "dojo/dom",
    "dojo/dom-class",
    "dojo/dom-style",
    "dojo/dnd/move",
    "dojo/sniff",
    "dojo/dom-geometry",
    "esri/geometry/Point",
    "esri/geometry/Extent",
    "dojo/dom-construct"
],
function (
    declare,
    lang,
    _WidgetBase, _OnDijitClickMixin, _TemplatedMixin,
    on,
    dijitTemplate, i18n,
    dom, domClass, domStyle,
    move,
    sniff,
    domGeom,
    Point, Extent,
    domConstruct
) {
    return declare([_WidgetBase, _OnDijitClickMixin, _TemplatedMixin], {
        declaredClass: "modules.LayerSwipe",
        templateString: dijitTemplate,
        options: {
            theme: "LayerSwipe",
            map: null,
            layers: [],
            enabled: true,
            tool: "vertical",
            toolClip: 9,
            toolOffsetTop: null,
            toolOffsetLeft: null
        },
        // lifecycle: 1
        constructor: function(options, srcRefNode) {
            // mix in settings and defaults
            declare.safeMixin(this.options, options);
            // widget node
            this.domNode = srcRefNode;
            this._i18n = i18n;
            // properties
            this.set("map", this.options.map);
            this.set("layers", this.options.layers);
            this.set("toolOffsetTop", this.options.toolOffsetTop);
            this.set("toolOffsetLeft", this.options.toolOffsetLeft);
            this.set("theme", this.options.theme);
            this.set("enabled", this.options.enabled);
            this.set("tool", this.options.tool);
            this.set("toolClip", this.options.toolClip);
            // listeners
            this.watch("theme", this._updateThemeWatch);
            this.watch("enabled", this._enabled);
            this.watch("tool", this._tool);
            // classes
            this._css = {
                handleContainer: "handleContainer",
                handle: "handle"
            };
            // event listeners array
            this._listeners = [];
        },
        // start widget. called by user
        startup: function() {
            // map not defined
            if (!this.map) {
                this.destroy();
                return new Error('map required');
            }
            // if layers are set by ID string
            for (var i = 0; i < this.layers.length; i++) {
                if (typeof this.layers[i] === 'string') {
                    // get layer
                    this.layers[i] = this.map.getLayer(this.layers[i]);
                }
            }
            // set layers
            this.set("layers", this.layers);
            // no layers set
            if (!this.layers.length) {
                this.destroy();
                return new Error('layer required');
            }
            // when map is loaded
            if (this.map.loaded) {
                this._init();
            } else {
                on.once(this.map, "load", lang.hitch(this, function() {
                    this._init();
                }));
            }
        },
        // connections/subscriptions will be cleaned up during the destroy() lifecycle phase
        destroy: function() {
            this._removeEvents();
            this.inherited(arguments);
        },
        /* ---------------- */
        /* Public Events */
        /* ---------------- */
        onLoad: function() {
            this.set("loaded", true);
        },
        /* ---------------- */
        /* Public Functions */
        /* ---------------- */
        enable: function() {
            this.set("enabled", true);
        },
        disable: function() {
            this.set("enabled", false);
        },
        /* ---------------- */
        /* Private Functions */
        /* ---------------- */
        _mb: function() {
            // set containing coordinates for scope tool
            var mapBox = domGeom.getMarginBox(this.map.root);
            var b = {};
            b.t = 0;
            b.l = 0;
            b.w = mapBox.l + mapBox.w;
            b.h = mapBox.h + mapBox.t;
            return b;
        },
        _setSwipeType: function() {
            // set the tool type
            var moveBox, left, top;
            if (this.get("tool")) {
                if (this._swipeslider) {
                    this._swipeslider.destroy();
                }
                domClass.add(this._moveableNode, this.get("tool"));
                moveBox = domGeom.getMarginBox(this._moveableNode);
                if (this.get("tool") === "scope") {
                    this._swipeslider = new move.constrainedMoveable(this._moveableNode, {
                        handle: this._moveableNode.id,
                        constraints: lang.hitch(this, this._mb),
                        within: true
                    });
                    // set initial position
                    left = (this.map.width / 2) - (moveBox.w / 2);
                    top = (this.map.height / 2) - (moveBox.h / 2);
                    if (this.get("toolOffsetTop")) {
                        top = this.get("toolOffsetTop");
                    }
                    if (this.get("toolOffsetLeft")) {
                        left = this.get("toolOffsetLeft");
                    }
                } else if (this.get("tool") === "horizontal") {
                    // create movable
                    this._swipeslider = new move.parentConstrainedMoveable(this._moveableNode, {
                        area: "content",
                        within: true
                    });
                    // set initial position
                    left = 0;
                    top = (this.map.height / 4) - (moveBox.h / 2);
                    if (this.get("toolOffsetTop")) {
                        top = this.get("toolOffsetTop");
                    }
                    // set clip var
                    this._clipval = top;
                } else {
                    // create movable
                    this._swipeslider = new move.parentConstrainedMoveable(this._moveableNode, {
                        area: "content",
                        within: true
                    });
                    // set initial position
                    left = (this.map.width / 4) - (moveBox.w / 2);
                    top = 0;
                    if (this.get("toolOffsetLeft")) {
                        left = this.get("toolOffsetLeft");
                    }
                    // set clip var
                    this._clipval = left;
                }
                domStyle.set(this._moveableNode, {
                    top: top + "px",
                    left: left + "px"
                });
            }
        },
        _init: function() {
            // set type of swipe tool
            this._setSwipeType();
            // move domnode into map layers node
            domConstruct.place(this.domNode, this.map._layersDiv, 'last');
            // swipe it
            this._swipe();
            // clip it
            this._setupEvents();
            // we're ready
            this.onLoad();
        },
        _removeEvents: function() {
            if (this._listeners.length) {
                for (var i = 0; i < this._listeners.length; i++) {
                    this._listeners[i].remove();
                }
            }
            this._listeners = [];
        },
        _setClipValue: function() {
            var moveBox = domGeom.getMarginBox(this._moveableNode);
            if (this.get("tool") === "vertical") {
                var leftInt = moveBox.l;
                if (leftInt <= 0 || leftInt >= (this.map.width)) {
                    return;
                }
                this._clipval = leftInt;
            }
            if (this.get("tool") === "horizontal") {
                var topInt = moveBox.t;
                if (topInt <= 0 || topInt >= (this.map.height)) {
                    return;
                }
                this._clipval = topInt;
            }
        },
        _setupEvents: function() {
            this._removeEvents();
            // swipe move
            this._swipeMove = on.pausable(this._swipeslider, 'Move', lang.hitch(this, function() {
                this._setClipValue();
                this._swipe();
            }));
            this._listeners.push(this._swipeMove);
            // done panning
            this._swipePanEnd = on.pausable(this.map, 'pan-end', lang.hitch(this, function() {
                this._swipe();
            }));
            this._listeners.push(this._swipePanEnd);
            // map graphics have been updated
            this._mapUpdateEnd = on.pausable(this.map, 'update-end', lang.hitch(this, function() {
                this._swipe();
            }));
            this._listeners.push(this._mapUpdateEnd);
            // css panning
            if (this.map.navigationMode === "css-transforms") {
                this._swipePan = on.pausable(this.map, 'pan', lang.hitch(this, function() {
                    this._swipe();
                }));
                this._listeners.push(this._swipePan);
            }
            // scope has been clicked
            this._toolClick = on.pausable(this._moveableNode, 'click', lang.hitch(this, function(evt) {
                if (this._clickCoords && this._clickCoords.x === evt.x && this._clickCoords.y === evt.y) {
                    var position = domGeom.position(this.map.root, true);
                    var x = evt.pageX - position.x;
                    var y = evt.pageY - position.y;
                    evt.x = x;
                    evt.y = y;
                    evt.screenPoint = {
                        x: x,
                        y: y
                    };
                    evt.type = "click";
                    evt.mapPoint = this.map.toMap(new Point(x, y, this.map.spatialReference));
                    this.map.onClick(evt, "other");
                }
                this._clickCoords = null;
            }));
            this._listeners.push(this._toolClick);
            // scope mouse down click
            this._evtCoords = on.pausable(this._swipeslider, "MouseDown", lang.hitch(this, function(evt) {
                this._clickCoords = {
                    x: evt.x,
                    y: evt.y
                };
            }));
            this._listeners.push(this._evtCoords);
        },
        _swipe: function() {
            // each layer
            for (var i = 0; i < this.layers.length; i++) {
                var rightval, leftval, topval, bottomval, layerBox, moveBox, mapBox;
                if (this.get("tool") === "vertical") {
                    layerBox = domGeom.getMarginBox(this.layers[i]._div);
                    mapBox = domGeom.getMarginBox(this.map.root);
                    if (layerBox.l > 0) {
                        rightval = this._clipval - Math.abs(layerBox.l);
                        leftval = -(layerBox.l);
                    } else if (layerBox.l < 0) {
                        leftval = 0;
                        rightval = this._clipval + Math.abs(layerBox.l);
                    } else {
                        leftval = 0;
                        rightval = this._clipval;
                    }
                    if (layerBox.t > 0) {
                        topval = -(layerBox.t);
                        bottomval = mapBox.h - layerBox.t;
                    } else if (layerBox.t < 0) {
                        topval = 0;
                        bottomval = mapBox.h + Math.abs(layerBox.t);
                    } else {
                        topval = 0;
                        bottomval = mapBox.h;
                    }
                } else if (this.get("tool") === "horizontal") {
                    layerBox = domGeom.getMarginBox(this.layers[i]._div);
                    mapBox = domGeom.getMarginBox(this.map.root);
                    if (layerBox.t > 0) {
                        bottomval = this._clipval - Math.abs(layerBox.t);
                        topval = -(layerBox.t);
                    } else if (layerBox.t < 0) {
                        topval = 0;
                        bottomval = this._clipval + Math.abs(layerBox.t);
                    } else {
                        topval = 0;
                        bottomval = this._clipval;
                    }
                    if (layerBox.l > 0) {
                        leftval = -(layerBox.l);
                        rightval = mapBox.w - layerBox.l;
                    } else if (layerBox.l < 0) {
                        leftval = 0;
                        rightval = mapBox.w + Math.abs(layerBox.l);
                    } else {
                        leftval = 0;
                        rightval = mapBox.w;
                    }
                } else if (this.get("tool") === "scope") {
                    moveBox = domGeom.getMarginBox(this._moveableNode);
                    leftval = moveBox.l;
                    rightval = leftval + moveBox.w;
                    topval = moveBox.t;
                    bottomval = topval + moveBox.h;
                    if (this.toolClip) {
                        leftval += this.toolClip;
                        rightval += -this.toolClip;
                        topval += this.toolClip;
                        bottomval += -this.toolClip;
                    }
                }
                // graphics layer
                if (this.layers[i].graphics && this.layers[i].graphics.length) {
                    var ll, ur;
                    if (this.get("tool") === "vertical") {
                        ll = this.map.toMap(new Point(0, this.map.height, this.map.spatialReference));
                        ur = this.map.toMap(new Point(this._clipval, 0, this.map.spatialReference));
                    } else if (this.get("tool") === "horizontal") {
                        ll = this.map.toMap(new Point(0, this._clipval, this.map.spatialReference));
                        ur = this.map.toMap(new Point(this.map.width, 0, this.map.spatialReference));
                    } else if (this.get("tool") === "scope") {
                        ll = this.map.toMap(new Point(leftval, bottomval, this.map.spatialReference));
                        ur = this.map.toMap(new Point(rightval, topval, this.map.spatialReference));
                    }
                    var leftExtent = new Extent(ll.x, ll.y, ur.x, ur.y, this.map.spatialReference);
                    if (leftExtent) {
                        for (var k = 0; k < this.layers[i].graphics.length; k++) {
                            var graphic = this.layers[i].graphics[k];
                            var center = graphic.geometry.type === 'point' ? graphic.geometry : graphic.geometry.getExtent().getCenter();
                            if (leftExtent.contains(center)) {
                                graphic.show();
                            } else {
                                graphic.hide();
                            }
                        }
                    }
                } else if (this.layers[i]._div) {
                    // clip div
                    if (typeof rightval !== 'undefined' && typeof leftval !== 'undefined' && typeof topval !== 'undefined' && typeof bottomval !== 'undefined') {
                        // If CSS Transformation is applied to the layer (i.e. swipediv),
                        // record the amount of translation and adjust clip rect
                        // accordingly
                        var tx = 0,
                            ty = 0;
                        if (this.map.navigationMode === "css-transforms") {
                            var prefix = "";
                            if (sniff("webkit")) {
                                prefix = "-webkit-";
                            }
                            if (sniff("ff")) {
                                prefix = "-moz-";
                            }
                            if (sniff("ie")) {
                                prefix = "-ms-";
                            }
                            if (sniff("opera")) {
                                prefix = "-o-";
                            }
                            var transformValue = this.layers[i]._div.style.getPropertyValue(prefix + "transform");
                            if (transformValue) {
                                if (transformValue.toLowerCase().indexOf("translate3d") !== -1) {
                                    transformValue = transformValue.replace("translate3d(", "").replace(")", "").replace(/px/ig, "").replace(/\s/i, "").split(",");
                                } else if (transformValue.toLowerCase().indexOf("translate") !== -1) {
                                    transformValue = transformValue.replace("translate(", "").replace(")", "").replace(/px/ig, "").replace(/\s/i, "").split(",");
                                }
                                try {
                                    tx = parseFloat(transformValue[0]);
                                    ty = parseFloat(transformValue[1]);
                                } catch (e) {
                                    console.error(e);
                                }
                                leftval -= tx;
                                rightval -= tx;
                                topval -= ty;
                                bottomval -= ty;
                            }
                        }
                        //Syntax for clip "rect(top,right,bottom,left)"
                        //var clipstring = "rect(0px " + val + "px " + map.height + "px " + " 0px)";
                        var clipstring = "rect(" + topval + "px " + rightval + "px " + bottomval + "px " + leftval + "px)";
                        domStyle.set(this.layers[i]._div, "clip", clipstring);
                    }
                }
            }
        },
        _updateThemeWatch: function(attr, oldVal, newVal) {
            domClass.remove(this.domNode, oldVal);
            domClass.add(this.domNode, newVal);
        },
        _tool: function(name, oldValue) {
            // remove old css class
            if (oldValue) {
                domClass.remove(this._moveableNode, oldValue);
            }
            // set type of swipe tool
            this._setSwipeType();
            // swipe it
            this._enabled();
        },
        _enabled: function() {
            if (this.get("enabled")) {
                // widget enabled
                this._setupEvents();
                this._setClipValue();
                this._swipeMove.resume();
                this._swipePanEnd.resume();
                this._evtCoords.resume();
                this._toolClick.resume();
                this._mapUpdateEnd.resume();
                if (this._swipePan) {
                    this._swipePan.resume();
                }
                domStyle.set(this.domNode, 'display', 'block');
                this._swipe();
            } else {
                // widget disabled
                this._swipeMove.pause();
                this._swipePanEnd.pause();
                this._evtCoords.pause();
                this._toolClick.pause();
                this._mapUpdateEnd.pause();
                if (this._swipePan) {
                    this._swipePan.pause();
                }
                domStyle.set(this.domNode, 'display', 'none');
                // unclip layers
                for (var i = 0; i < this.layers.length; i++) {
                    if (this.layers[i]._div) {
                        var clipstring = sniff('ie') ? "rect(auto auto auto auto)" : "";
                        domStyle.set(this.layers[i]._div, "clip", clipstring);
                    }
                }
            }
        }
    });
});