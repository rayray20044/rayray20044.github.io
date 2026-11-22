/* dc-mini.js — a tiny renderer for the "Under 30" concept pages.
   Supports {{path}} holes, <sc-for>, <sc-if>, onClick handlers and a
   React-like component class (state, setState, componentDidMount). */
(function () {
  'use strict';

  function DCLogic(props) {
    this.props = props || {};
    this.state = {};
  }
  DCLogic.prototype.setState = function (patch) {
    var next = typeof patch === 'function' ? patch(this.state) : patch;
    this.state = Object.assign({}, this.state, next);
    if (this.__schedule) this.__schedule();
  };
  DCLogic.prototype.forceUpdate = function () { if (this.__schedule) this.__schedule(); };
  window.DCLogic = DCLogic;

  var HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;
  var WHOLE = /^\{\{\s*([^}]+?)\s*\}\}$/;

  function lookup(path, scope) {
    if (path === 'true') return true;
    if (path === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(path)) return Number(path);
    var parts = path.split('.');
    var cur = scope;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  function interp(str, scope) {
    return str.replace(HOLE, function (_, p) {
      var v = lookup(p, scope);
      return v == null ? '' : String(v);
    });
  }

  var SKIP_ATTR = { 'hint-placeholder-count': 1, 'hint-placeholder-val': 1, 'hint-size': 1 };

  // Build a fresh DOM fragment from a template node and a scope.
  function build(node, scope, out) {
    if (node.nodeType === 3) {
      out.appendChild(document.createTextNode(interp(node.nodeValue, scope)));
      return;
    }
    if (node.nodeType !== 1) return;
    var tag = node.tagName.toLowerCase();

    if (tag === 'sc-for' || node.hasAttribute('data-sc-for')) {
      var isAttr = tag !== 'sc-for';
      var listExpr = node.getAttribute(isAttr ? 'sc-list' : 'list') || '';
      var asName = node.getAttribute(isAttr ? 'sc-as' : 'as') || 'item';
      var m = listExpr.match(WHOLE);
      var list = m ? lookup(m[1], scope) : null;
      if (!list || !list.length) return;
      for (var i = 0; i < list.length; i++) {
        var child = Object.create(scope);
        child[asName] = list[i];
        child.$index = i;
        if (isAttr) {
          buildElement(node, child, out, true);
        } else {
          for (var c = node.firstChild; c; c = c.nextSibling) build(c, child, out);
        }
      }
      return;
    }

    if (tag === 'sc-if') {
      var vm = (node.getAttribute('value') || '').match(WHOLE);
      if (vm && lookup(vm[1], scope)) {
        for (var k = node.firstChild; k; k = k.nextSibling) build(k, scope, out);
      }
      return;
    }

    buildElement(node, scope, out, false);
  }

  function buildElement(node, scope, out, stripFor) {
    var el = node.namespaceURI === 'http://www.w3.org/2000/svg'
      ? document.createElementNS(node.namespaceURI, node.tagName)
      : document.createElement(node.tagName);
    for (var a = 0; a < node.attributes.length; a++) {
      var at = node.attributes[a];
      var name = at.name;
      if (SKIP_ATTR[name]) continue;
      if (stripFor && (name === 'data-sc-for' || name === 'sc-list' || name === 'sc-as')) continue;
      var val = at.value;
      var whole = val.match(WHOLE);
      if (/^on[A-Z]/.test(name) || /^on[a-z]+$/.test(name) && whole) {
        var fn = whole ? lookup(whole[1], scope) : null;
        el.__dcHandlers = el.__dcHandlers || {};
        el.__dcHandlers[name.slice(2).toLowerCase()] = fn;
        continue;
      }
      if (whole) {
        var v = lookup(whole[1], scope);
        if (v === false || v == null) continue;
        el.setAttribute(name, v === true ? '' : String(v));
      } else {
        el.setAttribute(name, interp(val, scope));
      }
    }
    var src = node.tagName.toLowerCase() === 'template' ? node.content : node;
    for (var c = src.firstChild; c; c = c.nextSibling) build(c, scope, el);
    out.appendChild(el);
  }

  // Patch an existing DOM to match a freshly built one, keeping nodes
  // (and their running CSS animations) wherever they are unchanged.
  function morph(cur, next) {
    var a = cur.firstChild, b = next.firstChild;
    while (b) {
      var nb = b.nextSibling;
      if (!a) { cur.appendChild(b); bindAll(b); b = nb; continue; }
      else if (a.nodeType !== b.nodeType || (a.nodeType === 1 && a.tagName !== b.tagName)) {
        cur.replaceChild(b, a); bindAll(b); a = b;
      } else if (a.nodeType === 3) {
        if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue;
      } else if (a.nodeType === 1) {
        syncAttrs(a, b);
        a.__dcHandlers = b.__dcHandlers;
        bindHandlers(a);
        if (!(a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) morph(a, b);
      }
      a = a.nextSibling;
      b = nb;
    }
    while (a) { var na = a.nextSibling; cur.removeChild(a); a = na; }
  }

  function syncAttrs(a, b) {
    var i, at;
    for (i = a.attributes.length - 1; i >= 0; i--) {
      at = a.attributes[i];
      if (!b.hasAttribute(at.name)) a.removeAttribute(at.name);
    }
    for (i = 0; i < b.attributes.length; i++) {
      at = b.attributes[i];
      if (a.getAttribute(at.name) !== at.value) a.setAttribute(at.name, at.value);
    }
  }

  function bindHandlers(el) {
    if (!el.__dcHandlers) return;
    el.__dcBound = el.__dcBound || {};
    Object.keys(el.__dcHandlers).forEach(function (evt) {
      if (el.__dcBound[evt]) return;
      el.__dcBound[evt] = true;
      el.addEventListener(evt, function (e) {
        var fn = el.__dcHandlers && el.__dcHandlers[evt];
        if (typeof fn === 'function') fn(e);
      });
    });
  }

  function bindAll(root) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    var n = root;
    while (n) { bindHandlers(n); n = walker.nextNode(); }
  }

  function start() {
    var tplEl = document.getElementById('dc-template');
    var codeEl = document.querySelector('script[data-dc-script]');
    var mount = document.getElementById('dc-root');
    if (!tplEl || !mount) return;
    var tpl = document.createElement('template');
    tpl.innerHTML = tplEl.textContent;
    var Component = codeEl
      ? new Function('DCLogic', codeEl.textContent + '\n;return Component;')(DCLogic)
      : DCLogic;
    var inst = new Component({});
    if (!inst.state) inst.state = {};
    var queued = false;
    function render() {
      queued = false;
      var vals = inst.renderVals ? inst.renderVals() : {};
      var frag = document.createElement('div');
      for (var c = tpl.content.firstChild; c; c = c.nextSibling) build(c, vals, frag);
      if (!mount.firstChild) {
        while (frag.firstChild) mount.appendChild(frag.firstChild);
        bindAll(mount);
      } else {
        morph(mount, frag);
      }
    }
    inst.__schedule = function () {
      if (queued) return;
      queued = true;
      (window.requestAnimationFrame || setTimeout)(render);
    };
    render();
    if (inst.componentDidMount) inst.componentDidMount();
    window.addEventListener('pagehide', function () {
      if (inst.componentWillUnmount) inst.componentWillUnmount();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
