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
    "dojo/dom-geometry"
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
    domGeom
) {
    return declare([_WidgetBase, _OnDijitClickMixin, _TemplatedMixin], {
        declaredClass: "modules.LayerSwipe",
        templateString: dijitTemplate,
        options: {
            theme: "LayerSwipe",
            map: null,
            layer: null,
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
            this.set("layer", this.options.layer);
            this.set("toolOffsetTop", this.options.toolOffsetTop);
            this.set("toolOffsetLeft", this.options.toolOffsetLeft);
            this.set("theme", this.options.theme);
            this.set("enabled", this.options.enabled);
            this.set("tool", this.options.tool);
            this.set("toolClip", this.options.toolClip);
            // listeners
            this.watch("theme", this._updateThemeWatch);
            this.watch("visible", this._visible);
            this.watch("enabled", this._enabled);
            this.watch("tool", this._tool);
            // classes
            this._css = {
                handleContainer: "handleContainer",
                handle: "handle"
            };
            this._listeners = [];
        },
        // start widget. called by user
        startup: function() {
            var _self = this;
            // map not defined
            if (!_self.map) {
                _self.destroy();
                return new Error('map required');
            }
            if (typeof _self.layer === 'string') {
                _self.set("layer", _self.map.getLayer(_self.layer));
            }
            if (!_self.layer) {
                _self.destroy();
                return new Error('layer required');
            }
            _self.set("visible", _self.get("layer").visible);
            // when map is loaded
            if (_self.map.loaded) {
                _self._init();
            } else {
                on.once(_self.map, "load", function() {
                    _self._init();
                });
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
        show: function() {
            this.set("visible", true);
        },
        hide: function() {
            this.set("visible", false);
        },
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
            var mapBox = domGeom.getMarginBox(this.map.root);
            var b = {};
            b.t = 0;
            b.l = 0;
            b.w = mapBox.l + mapBox.w;
            b.h = mapBox.h + mapBox.t;
            return b;
        },
        _setSwipeType: function() {
            var _self = this;
            var moveBox, left, top;
            if (_self._swipeslider) {
                _self._swipeslider.destroy();
            }
            domClass.add(_self._moveableNode, _self.get("tool"));
            moveBox = domGeom.getMarginBox(_self._moveableNode);
            if (_self.get("tool") === "scope") {
                _self._swipeslider = new move.constrainedMoveable(_self._moveableNode, {
                    handle: _self._moveableNode.id,
                    constraints: lang.hitch(this, _self._mb),
                    within: true
                });
                // set initial position
                left = (_self.map.width / 2) - (moveBox.w / 2);
                top = (_self.map.height / 2) - (moveBox.h / 2);
                if (_self.get("toolOffsetTop")) {
                    top = _self.get("toolOffsetTop");
                }
                if (_self.get("toolOffsetLeft")) {
                    left = _self.get("toolOffsetLeft");
                }
            } else if (_self.get("tool") === "horizontal") {
                // create movable
                _self._swipeslider = new move.parentConstrainedMoveable(_self._moveableNode, {
                    area: "content",
                    within: true
                });
                // set initial position
                left = 0;
                top = (_self.map.height / 4) - (moveBox.h / 2);
                if (_self.get("toolOffsetTop")) {
                    top = _self.get("toolOffsetTop");
                }
                // set clip var
                _self._clipval = top;
            } else {
                // create movable
                _self._swipeslider = new move.parentConstrainedMoveable(_self._moveableNode, {
                    area: "content",
                    within: true
                });
                // set initial position
                left = (_self.map.width / 4) - (moveBox.w / 2);
                top = 0;
                if (_self.get("toolOffsetLeft")) {
                    left = _self.get("toolOffsetLeft");
                }
                // set clip var
                _self._clipval = left;
            }
            domStyle.set(_self._swipeslider.node, {
                top: top + "px",
                left: left + "px"
            });
        },
        _init: function() {
            var _self = this;
            // load swipe
            _self._initSwipe();
            // set visibility
            _self._visible();
            // set type of swipe tool
            _self._setSwipeType();
            // swipe it
            _self._swipe();
            // clip it
            _self._setupEvents();
            // we're ready
            _self.onLoad();
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
            var moveBox = domGeom.getMarginBox(this._swipeslider.node);
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
            var _self = this;
            _self._removeEvents();
            _self._swipeMove = on.pausable(_self._swipeslider, 'Move', function() {
                _self._setClipValue();
                _self._swipe();
            });
            _self._listeners.push(_self._swipeMove);
            _self._swipePanEnd = on.pausable(_self.map, 'pan-end', function() {
                _self._swipe();
            });
            _self._listeners.push(_self._swipePanEnd);
            if (_self.map.navigationMode === "css-transforms") {
                _self._swipePan = on.pausable(_self.map, 'pan', function() {
                    _self._swipe();
                });
                _self._listeners.push(_self._swipePan);
            }
            _self._layerToggle = on(_self.get("layer"), 'visibility-change', function(e) {
                _self.set("visible", e.visible);
            });
            _self._listeners.push(_self._layerToggle);
        },
        _initSwipe: function() {
            var _self = this;
            if (!_self.get("layer")) {
                return;
            }
            _self._swipediv = _self.get("layer")._div;
        },
        _swipe: function() {
            var _self = this;
            if (_self._swipediv) {
                var layerBox, moveBox, mapBox, rightval, leftval, topval, bottomval, offset_left, offset_top;
                if (_self.get("tool") === "scope") {
                    moveBox = domGeom.getMarginBox(_self._moveableNode);
                    leftval = moveBox.l;
                    rightval = leftval + moveBox.w;
                    topval = moveBox.t;
                    bottomval = topval + moveBox.h;
                    if (_self.toolClip) {
                        leftval += _self.toolClip;
                        rightval += -_self.toolClip;
                        topval += _self.toolClip;
                        bottomval += -_self.toolClip;
                    }
                } else if (_self.get("tool") === "horizontal") {
                    layerBox = domGeom.getMarginBox(_self._swipediv);
                    mapBox = domGeom.getMarginBox(_self.map.root);
                    offset_left = layerBox.l;
                    offset_top = layerBox.t;
                    if (offset_top > 0) {
                        bottomval = _self._clipval - Math.abs(offset_top);
                        topval = -(offset_top);
                    } else if (offset_top < 0) {
                        topval = 0;
                        bottomval = _self._clipval + Math.abs(offset_top);
                    } else {
                        topval = 0;
                        bottomval = _self._clipval;
                    }
                    var width = mapBox.w;
                    if (offset_left > 0) {
                        leftval = -(offset_left);
                        rightval = width - offset_left;
                    } else if (offset_left < 0) {
                        leftval = 0;
                        rightval = width + Math.abs(offset_left);
                    } else {
                        leftval = 0;
                        rightval = width;
                    }
                } else {
                    layerBox = domGeom.getMarginBox(_self._swipediv);
                    mapBox = domGeom.getMarginBox(_self.map.root);
                    offset_left = layerBox.l;
                    offset_top = layerBox.t;
                    if (offset_left > 0) {
                        rightval = _self._clipval - Math.abs(offset_left);
                        leftval = -(offset_left);
                    } else if (offset_left < 0) {
                        leftval = 0;
                        rightval = _self._clipval + Math.abs(offset_left);
                    } else {
                        leftval = 0;
                        rightval = _self._clipval;
                    }
                    var height = mapBox.h;
                    if (offset_top > 0) {
                        topval = -(offset_top);
                        bottomval = height - offset_top;
                    } else if (offset_top < 0) {
                        topval = 0;
                        bottomval = height + Math.abs(offset_top);
                    } else {
                        topval = 0;
                        bottomval = height;
                    }
                }
                // If CSS Transformation is applied to the layer (i.e. swipediv),
                // record the amount of translation and adjust clip rect
                // accordingly
                var tx = 0,
                    ty = 0;
                if (_self.map.navigationMode === "css-transforms") {
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
                    var transformValue = _self._swipediv.style.getPropertyValue(prefix + "transform");
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
                domStyle.set(_self._swipediv, "clip", clipstring);
            }
        },
        _updateThemeWatch: function(attr, oldVal, newVal) {
            var _self = this;
            domClass.remove(_self.domNode, oldVal);
            domClass.add(_self.domNode, newVal);
        },
        _tool: function(name, oldValue, value) {
            domClass.remove(this._moveableNode, oldValue);
            // set type of swipe tool
            this._setSwipeType();
            // swipe it
            this._enabled();
        },
        _enabled: function() {
            if (this.get("enabled")) {
                this._setupEvents();
                this._setClipValue();
                this._swipeMove.resume();
                this._swipePanEnd.resume();
                if (this._swipePan) {
                    this._swipePan.resume();
                }
                domStyle.set(this.domNode, 'display', 'block');
                this.get("layer").show();
                this._swipe();
            } else {
                this._swipeMove.pause();
                this._swipePanEnd.pause();
                if (this._swipePan) {
                    this._swipePan.pause();
                }
                domStyle.set(this.domNode, 'display', 'none');
                var clipstring = sniff('ie') ? "rect(auto auto auto auto)" : "";
                domStyle.set(this._swipediv, "clip", clipstring);
            }
        },
        _visible: function() {
            if (this.get("visible")) {
                this.get("layer").show();
            } else {
                this.get("layer").hide();
            }
        }
    });
});