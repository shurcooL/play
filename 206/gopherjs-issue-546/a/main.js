"use strict";
(function() {

Error.stackTraceLimit = Infinity;

var $global, $module;
if (typeof window !== "undefined") { /* web page */
  $global = window;
} else if (typeof self !== "undefined") { /* web worker */
  $global = self;
} else if (typeof global !== "undefined") { /* Node.js */
  $global = global;
  $global.require = require;
} else { /* others (e.g. Nashorn) */
  $global = this;
}

if ($global === undefined || $global.Array === undefined) {
  throw new Error("no global object found");
}
if (typeof module !== "undefined") {
  $module = module;
}

var $packages = {}, $idCounter = 0;
var $keys = function(m) { return m ? Object.keys(m) : []; };
var $flushConsole = function() {};
var $throwRuntimeError; /* set by package "runtime" */
var $throwNilPointerError = function() { $throwRuntimeError("invalid memory address or nil pointer dereference"); };
var $call = function(fn, rcvr, args) { return fn.apply(rcvr, args); };
var $makeFunc = function(fn) { return function() { return $externalize(fn(this, new ($sliceType($jsObjectPtr))($global.Array.prototype.slice.call(arguments, []))), $emptyInterface); }; };

var $mapArray = function(array, f) {
  var newArray = new array.constructor(array.length);
  for (var i = 0; i < array.length; i++) {
    newArray[i] = f(array[i]);
  }
  return newArray;
};

var $methodVal = function(recv, name) {
  var vals = recv.$methodVals || {};
  recv.$methodVals = vals; /* noop for primitives */
  var f = vals[name];
  if (f !== undefined) {
    return f;
  }
  var method = recv[name];
  f = function() {
    $stackDepthOffset--;
    try {
      return method.apply(recv, arguments);
    } finally {
      $stackDepthOffset++;
    }
  };
  vals[name] = f;
  return f;
};

var $methodExpr = function(typ, name) {
  var method = typ.prototype[name];
  if (method.$expr === undefined) {
    method.$expr = function() {
      $stackDepthOffset--;
      try {
        if (typ.wrapped) {
          arguments[0] = new typ(arguments[0]);
        }
        return Function.call.apply(method, arguments);
      } finally {
        $stackDepthOffset++;
      }
    };
  }
  return method.$expr;
};

var $ifaceMethodExprs = {};
var $ifaceMethodExpr = function(name) {
  var expr = $ifaceMethodExprs["$" + name];
  if (expr === undefined) {
    expr = $ifaceMethodExprs["$" + name] = function() {
      $stackDepthOffset--;
      try {
        return Function.call.apply(arguments[0][name], arguments);
      } finally {
        $stackDepthOffset++;
      }
    };
  }
  return expr;
};

var $subslice = function(slice, low, high, max) {
  if (low < 0 || high < low || max < high || high > slice.$capacity || max > slice.$capacity) {
    $throwRuntimeError("slice bounds out of range");
  }
  var s = new slice.constructor(slice.$array);
  s.$offset = slice.$offset + low;
  s.$length = slice.$length - low;
  s.$capacity = slice.$capacity - low;
  if (high !== undefined) {
    s.$length = high - low;
  }
  if (max !== undefined) {
    s.$capacity = max - low;
  }
  return s;
};

var $substring = function(str, low, high) {
  if (low < 0 || high < low || high > str.length) {
    $throwRuntimeError("slice bounds out of range");
  }
  return str.substring(low, high);
};

var $sliceToArray = function(slice) {
  if (slice.$length === 0) {
    return [];
  }
  if (slice.$array.constructor !== Array) {
    return slice.$array.subarray(slice.$offset, slice.$offset + slice.$length);
  }
  return slice.$array.slice(slice.$offset, slice.$offset + slice.$length);
};

var $decodeRune = function(str, pos) {
  var c0 = str.charCodeAt(pos);

  if (c0 < 0x80) {
    return [c0, 1];
  }

  if (c0 !== c0 || c0 < 0xC0) {
    return [0xFFFD, 1];
  }

  var c1 = str.charCodeAt(pos + 1);
  if (c1 !== c1 || c1 < 0x80 || 0xC0 <= c1) {
    return [0xFFFD, 1];
  }

  if (c0 < 0xE0) {
    var r = (c0 & 0x1F) << 6 | (c1 & 0x3F);
    if (r <= 0x7F) {
      return [0xFFFD, 1];
    }
    return [r, 2];
  }

  var c2 = str.charCodeAt(pos + 2);
  if (c2 !== c2 || c2 < 0x80 || 0xC0 <= c2) {
    return [0xFFFD, 1];
  }

  if (c0 < 0xF0) {
    var r = (c0 & 0x0F) << 12 | (c1 & 0x3F) << 6 | (c2 & 0x3F);
    if (r <= 0x7FF) {
      return [0xFFFD, 1];
    }
    if (0xD800 <= r && r <= 0xDFFF) {
      return [0xFFFD, 1];
    }
    return [r, 3];
  }

  var c3 = str.charCodeAt(pos + 3);
  if (c3 !== c3 || c3 < 0x80 || 0xC0 <= c3) {
    return [0xFFFD, 1];
  }

  if (c0 < 0xF8) {
    var r = (c0 & 0x07) << 18 | (c1 & 0x3F) << 12 | (c2 & 0x3F) << 6 | (c3 & 0x3F);
    if (r <= 0xFFFF || 0x10FFFF < r) {
      return [0xFFFD, 1];
    }
    return [r, 4];
  }

  return [0xFFFD, 1];
};

var $encodeRune = function(r) {
  if (r < 0 || r > 0x10FFFF || (0xD800 <= r && r <= 0xDFFF)) {
    r = 0xFFFD;
  }
  if (r <= 0x7F) {
    return String.fromCharCode(r);
  }
  if (r <= 0x7FF) {
    return String.fromCharCode(0xC0 | r >> 6, 0x80 | (r & 0x3F));
  }
  if (r <= 0xFFFF) {
    return String.fromCharCode(0xE0 | r >> 12, 0x80 | (r >> 6 & 0x3F), 0x80 | (r & 0x3F));
  }
  return String.fromCharCode(0xF0 | r >> 18, 0x80 | (r >> 12 & 0x3F), 0x80 | (r >> 6 & 0x3F), 0x80 | (r & 0x3F));
};

var $stringToBytes = function(str) {
  var array = new Uint8Array(str.length);
  for (var i = 0; i < str.length; i++) {
    array[i] = str.charCodeAt(i);
  }
  return array;
};

var $bytesToString = function(slice) {
  if (slice.$length === 0) {
    return "";
  }
  var str = "";
  for (var i = 0; i < slice.$length; i += 10000) {
    str += String.fromCharCode.apply(undefined, slice.$array.subarray(slice.$offset + i, slice.$offset + Math.min(slice.$length, i + 10000)));
  }
  return str;
};

var $stringToRunes = function(str) {
  var array = new Int32Array(str.length);
  var rune, j = 0;
  for (var i = 0; i < str.length; i += rune[1], j++) {
    rune = $decodeRune(str, i);
    array[j] = rune[0];
  }
  return array.subarray(0, j);
};

var $runesToString = function(slice) {
  if (slice.$length === 0) {
    return "";
  }
  var str = "";
  for (var i = 0; i < slice.$length; i++) {
    str += $encodeRune(slice.$array[slice.$offset + i]);
  }
  return str;
};

var $copyString = function(dst, src) {
  var n = Math.min(src.length, dst.$length);
  for (var i = 0; i < n; i++) {
    dst.$array[dst.$offset + i] = src.charCodeAt(i);
  }
  return n;
};

var $copySlice = function(dst, src) {
  var n = Math.min(src.$length, dst.$length);
  $copyArray(dst.$array, src.$array, dst.$offset, src.$offset, n, dst.constructor.elem);
  return n;
};

var $copyArray = function(dst, src, dstOffset, srcOffset, n, elem) {
  if (n === 0 || (dst === src && dstOffset === srcOffset)) {
    return;
  }

  if (src.subarray) {
    dst.set(src.subarray(srcOffset, srcOffset + n), dstOffset);
    return;
  }

  switch (elem.kind) {
  case $kindArray:
  case $kindStruct:
    if (dst === src && dstOffset > srcOffset) {
      for (var i = n - 1; i >= 0; i--) {
        elem.copy(dst[dstOffset + i], src[srcOffset + i]);
      }
      return;
    }
    for (var i = 0; i < n; i++) {
      elem.copy(dst[dstOffset + i], src[srcOffset + i]);
    }
    return;
  }

  if (dst === src && dstOffset > srcOffset) {
    for (var i = n - 1; i >= 0; i--) {
      dst[dstOffset + i] = src[srcOffset + i];
    }
    return;
  }
  for (var i = 0; i < n; i++) {
    dst[dstOffset + i] = src[srcOffset + i];
  }
};

var $clone = function(src, type) {
  var clone = type.zero();
  type.copy(clone, src);
  return clone;
};

var $pointerOfStructConversion = function(obj, type) {
  if(obj.$proxies === undefined) {
    obj.$proxies = {};
    obj.$proxies[obj.constructor.string] = obj;
  }
  var proxy = obj.$proxies[type.string];
  if (proxy === undefined) {
    var properties = {};
    for (var i = 0; i < type.elem.fields.length; i++) {
      (function(fieldProp) {
        properties[fieldProp] = {
          get: function() { return obj[fieldProp]; },
          set: function(value) { obj[fieldProp] = value; }
        };
      })(type.elem.fields[i].prop);
    }
    proxy = Object.create(type.prototype, properties);
    proxy.$val = proxy;
    obj.$proxies[type.string] = proxy;
    proxy.$proxies = obj.$proxies;
  }
  return proxy;
};

var $append = function(slice) {
  return $internalAppend(slice, arguments, 1, arguments.length - 1);
};

var $appendSlice = function(slice, toAppend) {
  if (toAppend.constructor === String) {
    var bytes = $stringToBytes(toAppend);
    return $internalAppend(slice, bytes, 0, bytes.length);
  }
  return $internalAppend(slice, toAppend.$array, toAppend.$offset, toAppend.$length);
};

var $internalAppend = function(slice, array, offset, length) {
  if (length === 0) {
    return slice;
  }

  var newArray = slice.$array;
  var newOffset = slice.$offset;
  var newLength = slice.$length + length;
  var newCapacity = slice.$capacity;

  if (newLength > newCapacity) {
    newOffset = 0;
    newCapacity = Math.max(newLength, slice.$capacity < 1024 ? slice.$capacity * 2 : Math.floor(slice.$capacity * 5 / 4));

    if (slice.$array.constructor === Array) {
      newArray = slice.$array.slice(slice.$offset, slice.$offset + slice.$length);
      newArray.length = newCapacity;
      var zero = slice.constructor.elem.zero;
      for (var i = slice.$length; i < newCapacity; i++) {
        newArray[i] = zero();
      }
    } else {
      newArray = new slice.$array.constructor(newCapacity);
      newArray.set(slice.$array.subarray(slice.$offset, slice.$offset + slice.$length));
    }
  }

  $copyArray(newArray, array, newOffset + slice.$length, offset, length, slice.constructor.elem);

  var newSlice = new slice.constructor(newArray);
  newSlice.$offset = newOffset;
  newSlice.$length = newLength;
  newSlice.$capacity = newCapacity;
  return newSlice;
};

var $equal = function(a, b, type) {
  if (type === $jsObjectPtr) {
    return a === b;
  }
  switch (type.kind) {
  case $kindComplex64:
  case $kindComplex128:
    return a.$real === b.$real && a.$imag === b.$imag;
  case $kindInt64:
  case $kindUint64:
    return a.$high === b.$high && a.$low === b.$low;
  case $kindArray:
    if (a.length !== b.length) {
      return false;
    }
    for (var i = 0; i < a.length; i++) {
      if (!$equal(a[i], b[i], type.elem)) {
        return false;
      }
    }
    return true;
  case $kindStruct:
    for (var i = 0; i < type.fields.length; i++) {
      var f = type.fields[i];
      if (!$equal(a[f.prop], b[f.prop], f.typ)) {
        return false;
      }
    }
    return true;
  case $kindInterface:
    return $interfaceIsEqual(a, b);
  default:
    return a === b;
  }
};

var $interfaceIsEqual = function(a, b) {
  if (a === $ifaceNil || b === $ifaceNil) {
    return a === b;
  }
  if (a.constructor !== b.constructor) {
    return false;
  }
  if (a.constructor === $jsObjectPtr) {
    return a.object === b.object;
  }
  if (!a.constructor.comparable) {
    $throwRuntimeError("comparing uncomparable type " + a.constructor.string);
  }
  return $equal(a.$val, b.$val, a.constructor);
};

var $min = Math.min;
var $mod = function(x, y) { return x % y; };
var $parseInt = parseInt;
var $parseFloat = function(f) {
  if (f !== undefined && f !== null && f.constructor === Number) {
    return f;
  }
  return parseFloat(f);
};

var $froundBuf = new Float32Array(1);
var $fround = Math.fround || function(f) {
  $froundBuf[0] = f;
  return $froundBuf[0];
};

var $imul = Math.imul || function(a, b) {
  var ah = (a >>> 16) & 0xffff;
  var al = a & 0xffff;
  var bh = (b >>> 16) & 0xffff;
  var bl = b & 0xffff;
  return ((al * bl) + (((ah * bl + al * bh) << 16) >>> 0) >> 0);
};

var $floatKey = function(f) {
  if (f !== f) {
    $idCounter++;
    return "NaN$" + $idCounter;
  }
  return String(f);
};

var $flatten64 = function(x) {
  return x.$high * 4294967296 + x.$low;
};

var $shiftLeft64 = function(x, y) {
  if (y === 0) {
    return x;
  }
  if (y < 32) {
    return new x.constructor(x.$high << y | x.$low >>> (32 - y), (x.$low << y) >>> 0);
  }
  if (y < 64) {
    return new x.constructor(x.$low << (y - 32), 0);
  }
  return new x.constructor(0, 0);
};

var $shiftRightInt64 = function(x, y) {
  if (y === 0) {
    return x;
  }
  if (y < 32) {
    return new x.constructor(x.$high >> y, (x.$low >>> y | x.$high << (32 - y)) >>> 0);
  }
  if (y < 64) {
    return new x.constructor(x.$high >> 31, (x.$high >> (y - 32)) >>> 0);
  }
  if (x.$high < 0) {
    return new x.constructor(-1, 4294967295);
  }
  return new x.constructor(0, 0);
};

var $shiftRightUint64 = function(x, y) {
  if (y === 0) {
    return x;
  }
  if (y < 32) {
    return new x.constructor(x.$high >>> y, (x.$low >>> y | x.$high << (32 - y)) >>> 0);
  }
  if (y < 64) {
    return new x.constructor(0, x.$high >>> (y - 32));
  }
  return new x.constructor(0, 0);
};

var $mul64 = function(x, y) {
  var high = 0, low = 0;
  if ((y.$low & 1) !== 0) {
    high = x.$high;
    low = x.$low;
  }
  for (var i = 1; i < 32; i++) {
    if ((y.$low & 1<<i) !== 0) {
      high += x.$high << i | x.$low >>> (32 - i);
      low += (x.$low << i) >>> 0;
    }
  }
  for (var i = 0; i < 32; i++) {
    if ((y.$high & 1<<i) !== 0) {
      high += x.$low << i;
    }
  }
  return new x.constructor(high, low);
};

var $div64 = function(x, y, returnRemainder) {
  if (y.$high === 0 && y.$low === 0) {
    $throwRuntimeError("integer divide by zero");
  }

  var s = 1;
  var rs = 1;

  var xHigh = x.$high;
  var xLow = x.$low;
  if (xHigh < 0) {
    s = -1;
    rs = -1;
    xHigh = -xHigh;
    if (xLow !== 0) {
      xHigh--;
      xLow = 4294967296 - xLow;
    }
  }

  var yHigh = y.$high;
  var yLow = y.$low;
  if (y.$high < 0) {
    s *= -1;
    yHigh = -yHigh;
    if (yLow !== 0) {
      yHigh--;
      yLow = 4294967296 - yLow;
    }
  }

  var high = 0, low = 0, n = 0;
  while (yHigh < 2147483648 && ((xHigh > yHigh) || (xHigh === yHigh && xLow > yLow))) {
    yHigh = (yHigh << 1 | yLow >>> 31) >>> 0;
    yLow = (yLow << 1) >>> 0;
    n++;
  }
  for (var i = 0; i <= n; i++) {
    high = high << 1 | low >>> 31;
    low = (low << 1) >>> 0;
    if ((xHigh > yHigh) || (xHigh === yHigh && xLow >= yLow)) {
      xHigh = xHigh - yHigh;
      xLow = xLow - yLow;
      if (xLow < 0) {
        xHigh--;
        xLow += 4294967296;
      }
      low++;
      if (low === 4294967296) {
        high++;
        low = 0;
      }
    }
    yLow = (yLow >>> 1 | yHigh << (32 - 1)) >>> 0;
    yHigh = yHigh >>> 1;
  }

  if (returnRemainder) {
    return new x.constructor(xHigh * rs, xLow * rs);
  }
  return new x.constructor(high * s, low * s);
};

var $divComplex = function(n, d) {
  var ninf = n.$real === Infinity || n.$real === -Infinity || n.$imag === Infinity || n.$imag === -Infinity;
  var dinf = d.$real === Infinity || d.$real === -Infinity || d.$imag === Infinity || d.$imag === -Infinity;
  var nnan = !ninf && (n.$real !== n.$real || n.$imag !== n.$imag);
  var dnan = !dinf && (d.$real !== d.$real || d.$imag !== d.$imag);
  if(nnan || dnan) {
    return new n.constructor(NaN, NaN);
  }
  if (ninf && !dinf) {
    return new n.constructor(Infinity, Infinity);
  }
  if (!ninf && dinf) {
    return new n.constructor(0, 0);
  }
  if (d.$real === 0 && d.$imag === 0) {
    if (n.$real === 0 && n.$imag === 0) {
      return new n.constructor(NaN, NaN);
    }
    return new n.constructor(Infinity, Infinity);
  }
  var a = Math.abs(d.$real);
  var b = Math.abs(d.$imag);
  if (a <= b) {
    var ratio = d.$real / d.$imag;
    var denom = d.$real * ratio + d.$imag;
    return new n.constructor((n.$real * ratio + n.$imag) / denom, (n.$imag * ratio - n.$real) / denom);
  }
  var ratio = d.$imag / d.$real;
  var denom = d.$imag * ratio + d.$real;
  return new n.constructor((n.$imag * ratio + n.$real) / denom, (n.$imag - n.$real * ratio) / denom);
};

var $kindBool = 1;
var $kindInt = 2;
var $kindInt8 = 3;
var $kindInt16 = 4;
var $kindInt32 = 5;
var $kindInt64 = 6;
var $kindUint = 7;
var $kindUint8 = 8;
var $kindUint16 = 9;
var $kindUint32 = 10;
var $kindUint64 = 11;
var $kindUintptr = 12;
var $kindFloat32 = 13;
var $kindFloat64 = 14;
var $kindComplex64 = 15;
var $kindComplex128 = 16;
var $kindArray = 17;
var $kindChan = 18;
var $kindFunc = 19;
var $kindInterface = 20;
var $kindMap = 21;
var $kindPtr = 22;
var $kindSlice = 23;
var $kindString = 24;
var $kindStruct = 25;
var $kindUnsafePointer = 26;

var $methodSynthesizers = [];
var $addMethodSynthesizer = function(f) {
  if ($methodSynthesizers === null) {
    f();
    return;
  }
  $methodSynthesizers.push(f);
};
var $synthesizeMethods = function() {
  $methodSynthesizers.forEach(function(f) { f(); });
  $methodSynthesizers = null;
};

var $ifaceKeyFor = function(x) {
  if (x === $ifaceNil) {
    return 'nil';
  }
  var c = x.constructor;
  return c.string + '$' + c.keyFor(x.$val);
};

var $identity = function(x) { return x; };

var $typeIDCounter = 0;

var $idKey = function(x) {
  if (x.$id === undefined) {
    $idCounter++;
    x.$id = $idCounter;
  }
  return String(x.$id);
};

var $newType = function(size, kind, string, named, pkg, exported, constructor) {
  var typ;
  switch(kind) {
  case $kindBool:
  case $kindInt:
  case $kindInt8:
  case $kindInt16:
  case $kindInt32:
  case $kindUint:
  case $kindUint8:
  case $kindUint16:
  case $kindUint32:
  case $kindUintptr:
  case $kindUnsafePointer:
    typ = function(v) { this.$val = v; };
    typ.wrapped = true;
    typ.keyFor = $identity;
    break;

  case $kindString:
    typ = function(v) { this.$val = v; };
    typ.wrapped = true;
    typ.keyFor = function(x) { return "$" + x; };
    break;

  case $kindFloat32:
  case $kindFloat64:
    typ = function(v) { this.$val = v; };
    typ.wrapped = true;
    typ.keyFor = function(x) { return $floatKey(x); };
    break;

  case $kindInt64:
    typ = function(high, low) {
      this.$high = (high + Math.floor(Math.ceil(low) / 4294967296)) >> 0;
      this.$low = low >>> 0;
      this.$val = this;
    };
    typ.keyFor = function(x) { return x.$high + "$" + x.$low; };
    break;

  case $kindUint64:
    typ = function(high, low) {
      this.$high = (high + Math.floor(Math.ceil(low) / 4294967296)) >>> 0;
      this.$low = low >>> 0;
      this.$val = this;
    };
    typ.keyFor = function(x) { return x.$high + "$" + x.$low; };
    break;

  case $kindComplex64:
    typ = function(real, imag) {
      this.$real = $fround(real);
      this.$imag = $fround(imag);
      this.$val = this;
    };
    typ.keyFor = function(x) { return x.$real + "$" + x.$imag; };
    break;

  case $kindComplex128:
    typ = function(real, imag) {
      this.$real = real;
      this.$imag = imag;
      this.$val = this;
    };
    typ.keyFor = function(x) { return x.$real + "$" + x.$imag; };
    break;

  case $kindArray:
    typ = function(v) { this.$val = v; };
    typ.wrapped = true;
    typ.ptr = $newType(4, $kindPtr, "*" + string, false, "", false, function(array) {
      this.$get = function() { return array; };
      this.$set = function(v) { typ.copy(this, v); };
      this.$val = array;
    });
    typ.init = function(elem, len) {
      typ.elem = elem;
      typ.len = len;
      typ.comparable = elem.comparable;
      typ.keyFor = function(x) {
        return Array.prototype.join.call($mapArray(x, function(e) {
          return String(elem.keyFor(e)).replace(/\\/g, "\\\\").replace(/\$/g, "\\$");
        }), "$");
      };
      typ.copy = function(dst, src) {
        $copyArray(dst, src, 0, 0, src.length, elem);
      };
      typ.ptr.init(typ);
      Object.defineProperty(typ.ptr.nil, "nilCheck", { get: $throwNilPointerError });
    };
    break;

  case $kindChan:
    typ = function(v) { this.$val = v; };
    typ.wrapped = true;
    typ.keyFor = $idKey;
    typ.init = function(elem, sendOnly, recvOnly) {
      typ.elem = elem;
      typ.sendOnly = sendOnly;
      typ.recvOnly = recvOnly;
    };
    break;

  case $kindFunc:
    typ = function(v) { this.$val = v; };
    typ.wrapped = true;
    typ.init = function(params, results, variadic) {
      typ.params = params;
      typ.results = results;
      typ.variadic = variadic;
      typ.comparable = false;
    };
    break;

  case $kindInterface:
    typ = { implementedBy: {}, missingMethodFor: {} };
    typ.keyFor = $ifaceKeyFor;
    typ.init = function(methods) {
      typ.methods = methods;
      methods.forEach(function(m) {
        $ifaceNil[m.prop] = $throwNilPointerError;
      });
    };
    break;

  case $kindMap:
    typ = function(v) { this.$val = v; };
    typ.wrapped = true;
    typ.init = function(key, elem) {
      typ.key = key;
      typ.elem = elem;
      typ.comparable = false;
    };
    break;

  case $kindPtr:
    typ = constructor || function(getter, setter, target) {
      this.$get = getter;
      this.$set = setter;
      this.$target = target;
      this.$val = this;
    };
    typ.keyFor = $idKey;
    typ.init = function(elem) {
      typ.elem = elem;
      typ.wrapped = (elem.kind === $kindArray);
      typ.nil = new typ($throwNilPointerError, $throwNilPointerError);
    };
    break;

  case $kindSlice:
    typ = function(array) {
      if (array.constructor !== typ.nativeArray) {
        array = new typ.nativeArray(array);
      }
      this.$array = array;
      this.$offset = 0;
      this.$length = array.length;
      this.$capacity = array.length;
      this.$val = this;
    };
    typ.init = function(elem) {
      typ.elem = elem;
      typ.comparable = false;
      typ.nativeArray = $nativeArray(elem.kind);
      typ.nil = new typ([]);
    };
    break;

  case $kindStruct:
    typ = function(v) { this.$val = v; };
    typ.wrapped = true;
    typ.ptr = $newType(4, $kindPtr, "*" + string, false, "", exported, constructor);
    typ.ptr.elem = typ;
    typ.ptr.prototype.$get = function() { return this; };
    typ.ptr.prototype.$set = function(v) { typ.copy(this, v); };
    typ.init = function(pkgPath, fields) {
      typ.pkgPath = pkgPath;
      typ.fields = fields;
      fields.forEach(function(f) {
        if (!f.typ.comparable) {
          typ.comparable = false;
        }
      });
      typ.keyFor = function(x) {
        var val = x.$val;
        return $mapArray(fields, function(f) {
          return String(f.typ.keyFor(val[f.prop])).replace(/\\/g, "\\\\").replace(/\$/g, "\\$");
        }).join("$");
      };
      typ.copy = function(dst, src) {
        for (var i = 0; i < fields.length; i++) {
          var f = fields[i];
          switch (f.typ.kind) {
          case $kindArray:
          case $kindStruct:
            f.typ.copy(dst[f.prop], src[f.prop]);
            continue;
          default:
            dst[f.prop] = src[f.prop];
            continue;
          }
        }
      };
      /* nil value */
      var properties = {};
      fields.forEach(function(f) {
        properties[f.prop] = { get: $throwNilPointerError, set: $throwNilPointerError };
      });
      typ.ptr.nil = Object.create(constructor.prototype, properties);
      typ.ptr.nil.$val = typ.ptr.nil;
      /* methods for embedded fields */
      $addMethodSynthesizer(function() {
        var synthesizeMethod = function(target, m, f) {
          if (target.prototype[m.prop] !== undefined) { return; }
          target.prototype[m.prop] = function() {
            var v = this.$val[f.prop];
            if (f.typ === $jsObjectPtr) {
              v = new $jsObjectPtr(v);
            }
            if (v.$val === undefined) {
              v = new f.typ(v);
            }
            return v[m.prop].apply(v, arguments);
          };
        };
        fields.forEach(function(f) {
          if (f.name === "") {
            $methodSet(f.typ).forEach(function(m) {
              synthesizeMethod(typ, m, f);
              synthesizeMethod(typ.ptr, m, f);
            });
            $methodSet($ptrType(f.typ)).forEach(function(m) {
              synthesizeMethod(typ.ptr, m, f);
            });
          }
        });
      });
    };
    break;

  default:
    $panic(new $String("invalid kind: " + kind));
  }

  switch (kind) {
  case $kindBool:
  case $kindMap:
    typ.zero = function() { return false; };
    break;

  case $kindInt:
  case $kindInt8:
  case $kindInt16:
  case $kindInt32:
  case $kindUint:
  case $kindUint8 :
  case $kindUint16:
  case $kindUint32:
  case $kindUintptr:
  case $kindUnsafePointer:
  case $kindFloat32:
  case $kindFloat64:
    typ.zero = function() { return 0; };
    break;

  case $kindString:
    typ.zero = function() { return ""; };
    break;

  case $kindInt64:
  case $kindUint64:
  case $kindComplex64:
  case $kindComplex128:
    var zero = new typ(0, 0);
    typ.zero = function() { return zero; };
    break;

  case $kindPtr:
  case $kindSlice:
    typ.zero = function() { return typ.nil; };
    break;

  case $kindChan:
    typ.zero = function() { return $chanNil; };
    break;

  case $kindFunc:
    typ.zero = function() { return $throwNilPointerError; };
    break;

  case $kindInterface:
    typ.zero = function() { return $ifaceNil; };
    break;

  case $kindArray:
    typ.zero = function() {
      var arrayClass = $nativeArray(typ.elem.kind);
      if (arrayClass !== Array) {
        return new arrayClass(typ.len);
      }
      var array = new Array(typ.len);
      for (var i = 0; i < typ.len; i++) {
        array[i] = typ.elem.zero();
      }
      return array;
    };
    break;

  case $kindStruct:
    typ.zero = function() { return new typ.ptr(); };
    break;

  default:
    $panic(new $String("invalid kind: " + kind));
  }

  typ.id = $typeIDCounter;
  $typeIDCounter++;
  typ.size = size;
  typ.kind = kind;
  typ.string = string;
  typ.named = named;
  typ.pkg = pkg;
  typ.exported = exported;
  typ.methods = [];
  typ.methodSetCache = null;
  typ.comparable = true;
  return typ;
};

var $methodSet = function(typ) {
  if (typ.methodSetCache !== null) {
    return typ.methodSetCache;
  }
  var base = {};

  var isPtr = (typ.kind === $kindPtr);
  if (isPtr && typ.elem.kind === $kindInterface) {
    typ.methodSetCache = [];
    return [];
  }

  var current = [{typ: isPtr ? typ.elem : typ, indirect: isPtr}];

  var seen = {};

  while (current.length > 0) {
    var next = [];
    var mset = [];

    current.forEach(function(e) {
      if (seen[e.typ.string]) {
        return;
      }
      seen[e.typ.string] = true;

      if (e.typ.named) {
        mset = mset.concat(e.typ.methods);
        if (e.indirect) {
          mset = mset.concat($ptrType(e.typ).methods);
        }
      }

      switch (e.typ.kind) {
      case $kindStruct:
        e.typ.fields.forEach(function(f) {
          if (f.name === "") {
            var fTyp = f.typ;
            var fIsPtr = (fTyp.kind === $kindPtr);
            next.push({typ: fIsPtr ? fTyp.elem : fTyp, indirect: e.indirect || fIsPtr});
          }
        });
        break;

      case $kindInterface:
        mset = mset.concat(e.typ.methods);
        break;
      }
    });

    mset.forEach(function(m) {
      if (base[m.name] === undefined) {
        base[m.name] = m;
      }
    });

    current = next;
  }

  typ.methodSetCache = [];
  Object.keys(base).sort().forEach(function(name) {
    typ.methodSetCache.push(base[name]);
  });
  return typ.methodSetCache;
};

var $Bool          = $newType( 1, $kindBool,          "bool",           true, "", false, null);
var $Int           = $newType( 4, $kindInt,           "int",            true, "", false, null);
var $Int8          = $newType( 1, $kindInt8,          "int8",           true, "", false, null);
var $Int16         = $newType( 2, $kindInt16,         "int16",          true, "", false, null);
var $Int32         = $newType( 4, $kindInt32,         "int32",          true, "", false, null);
var $Int64         = $newType( 8, $kindInt64,         "int64",          true, "", false, null);
var $Uint          = $newType( 4, $kindUint,          "uint",           true, "", false, null);
var $Uint8         = $newType( 1, $kindUint8,         "uint8",          true, "", false, null);
var $Uint16        = $newType( 2, $kindUint16,        "uint16",         true, "", false, null);
var $Uint32        = $newType( 4, $kindUint32,        "uint32",         true, "", false, null);
var $Uint64        = $newType( 8, $kindUint64,        "uint64",         true, "", false, null);
var $Uintptr       = $newType( 4, $kindUintptr,       "uintptr",        true, "", false, null);
var $Float32       = $newType( 4, $kindFloat32,       "float32",        true, "", false, null);
var $Float64       = $newType( 8, $kindFloat64,       "float64",        true, "", false, null);
var $Complex64     = $newType( 8, $kindComplex64,     "complex64",      true, "", false, null);
var $Complex128    = $newType(16, $kindComplex128,    "complex128",     true, "", false, null);
var $String        = $newType( 8, $kindString,        "string",         true, "", false, null);
var $UnsafePointer = $newType( 4, $kindUnsafePointer, "unsafe.Pointer", true, "", false, null);

var $nativeArray = function(elemKind) {
  switch (elemKind) {
  case $kindInt:
    return Int32Array;
  case $kindInt8:
    return Int8Array;
  case $kindInt16:
    return Int16Array;
  case $kindInt32:
    return Int32Array;
  case $kindUint:
    return Uint32Array;
  case $kindUint8:
    return Uint8Array;
  case $kindUint16:
    return Uint16Array;
  case $kindUint32:
    return Uint32Array;
  case $kindUintptr:
    return Uint32Array;
  case $kindFloat32:
    return Float32Array;
  case $kindFloat64:
    return Float64Array;
  default:
    return Array;
  }
};
var $toNativeArray = function(elemKind, array) {
  var nativeArray = $nativeArray(elemKind);
  if (nativeArray === Array) {
    return array;
  }
  return new nativeArray(array);
};
var $arrayTypes = {};
var $arrayType = function(elem, len) {
  var typeKey = elem.id + "$" + len;
  var typ = $arrayTypes[typeKey];
  if (typ === undefined) {
    typ = $newType(12, $kindArray, "[" + len + "]" + elem.string, false, "", false, null);
    $arrayTypes[typeKey] = typ;
    typ.init(elem, len);
  }
  return typ;
};

var $chanType = function(elem, sendOnly, recvOnly) {
  var string = (recvOnly ? "<-" : "") + "chan" + (sendOnly ? "<- " : " ") + elem.string;
  var field = sendOnly ? "SendChan" : (recvOnly ? "RecvChan" : "Chan");
  var typ = elem[field];
  if (typ === undefined) {
    typ = $newType(4, $kindChan, string, false, "", false, null);
    elem[field] = typ;
    typ.init(elem, sendOnly, recvOnly);
  }
  return typ;
};
var $Chan = function(elem, capacity) {
  if (capacity < 0 || capacity > 2147483647) {
    $throwRuntimeError("makechan: size out of range");
  }
  this.$elem = elem;
  this.$capacity = capacity;
  this.$buffer = [];
  this.$sendQueue = [];
  this.$recvQueue = [];
  this.$closed = false;
};
var $chanNil = new $Chan(null, 0);
$chanNil.$sendQueue = $chanNil.$recvQueue = { length: 0, push: function() {}, shift: function() { return undefined; }, indexOf: function() { return -1; } };

var $funcTypes = {};
var $funcType = function(params, results, variadic) {
  var typeKey = $mapArray(params, function(p) { return p.id; }).join(",") + "$" + $mapArray(results, function(r) { return r.id; }).join(",") + "$" + variadic;
  var typ = $funcTypes[typeKey];
  if (typ === undefined) {
    var paramTypes = $mapArray(params, function(p) { return p.string; });
    if (variadic) {
      paramTypes[paramTypes.length - 1] = "..." + paramTypes[paramTypes.length - 1].substr(2);
    }
    var string = "func(" + paramTypes.join(", ") + ")";
    if (results.length === 1) {
      string += " " + results[0].string;
    } else if (results.length > 1) {
      string += " (" + $mapArray(results, function(r) { return r.string; }).join(", ") + ")";
    }
    typ = $newType(4, $kindFunc, string, false, "", false, null);
    $funcTypes[typeKey] = typ;
    typ.init(params, results, variadic);
  }
  return typ;
};

var $interfaceTypes = {};
var $interfaceType = function(methods) {
  var typeKey = $mapArray(methods, function(m) { return m.pkg + "," + m.name + "," + m.typ.id; }).join("$");
  var typ = $interfaceTypes[typeKey];
  if (typ === undefined) {
    var string = "interface {}";
    if (methods.length !== 0) {
      string = "interface { " + $mapArray(methods, function(m) {
        return (m.pkg !== "" ? m.pkg + "." : "") + m.name + m.typ.string.substr(4);
      }).join("; ") + " }";
    }
    typ = $newType(8, $kindInterface, string, false, "", false, null);
    $interfaceTypes[typeKey] = typ;
    typ.init(methods);
  }
  return typ;
};
var $emptyInterface = $interfaceType([]);
var $ifaceNil = {};
var $error = $newType(8, $kindInterface, "error", true, "", false, null);
$error.init([{prop: "Error", name: "Error", pkg: "", typ: $funcType([], [$String], false)}]);

var $mapTypes = {};
var $mapType = function(key, elem) {
  var typeKey = key.id + "$" + elem.id;
  var typ = $mapTypes[typeKey];
  if (typ === undefined) {
    typ = $newType(4, $kindMap, "map[" + key.string + "]" + elem.string, false, "", false, null);
    $mapTypes[typeKey] = typ;
    typ.init(key, elem);
  }
  return typ;
};
var $makeMap = function(keyForFunc, entries) {
  var m = {};
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    m[keyForFunc(e.k)] = e;
  }
  return m;
};

var $ptrType = function(elem) {
  var typ = elem.ptr;
  if (typ === undefined) {
    typ = $newType(4, $kindPtr, "*" + elem.string, false, "", elem.exported, null);
    elem.ptr = typ;
    typ.init(elem);
  }
  return typ;
};

var $newDataPointer = function(data, constructor) {
  if (constructor.elem.kind === $kindStruct) {
    return data;
  }
  return new constructor(function() { return data; }, function(v) { data = v; });
};

var $indexPtr = function(array, index, constructor) {
  array.$ptr = array.$ptr || {};
  return array.$ptr[index] || (array.$ptr[index] = new constructor(function() { return array[index]; }, function(v) { array[index] = v; }));
};

var $sliceType = function(elem) {
  var typ = elem.slice;
  if (typ === undefined) {
    typ = $newType(12, $kindSlice, "[]" + elem.string, false, "", false, null);
    elem.slice = typ;
    typ.init(elem);
  }
  return typ;
};
var $makeSlice = function(typ, length, capacity) {
  capacity = capacity || length;
  if (length < 0 || length > 2147483647) {
    $throwRuntimeError("makeslice: len out of range");
  }
  if (capacity < 0 || capacity < length || capacity > 2147483647) {
    $throwRuntimeError("makeslice: cap out of range");
  }
  var array = new typ.nativeArray(capacity);
  if (typ.nativeArray === Array) {
    for (var i = 0; i < capacity; i++) {
      array[i] = typ.elem.zero();
    }
  }
  var slice = new typ(array);
  slice.$length = length;
  return slice;
};

var $structTypes = {};
var $structType = function(pkgPath, fields) {
  var typeKey = $mapArray(fields, function(f) { return f.name + "," + f.typ.id + "," + f.tag; }).join("$");
  var typ = $structTypes[typeKey];
  if (typ === undefined) {
    var string = "struct { " + $mapArray(fields, function(f) {
      return f.name + " " + f.typ.string + (f.tag !== "" ? (" \"" + f.tag.replace(/\\/g, "\\\\").replace(/"/g, "\\\"") + "\"") : "");
    }).join("; ") + " }";
    if (fields.length === 0) {
      string = "struct {}";
    }
    typ = $newType(0, $kindStruct, string, false, "", false, function() {
      this.$val = this;
      for (var i = 0; i < fields.length; i++) {
        var f = fields[i];
        var arg = arguments[i];
        this[f.prop] = arg !== undefined ? arg : f.typ.zero();
      }
    });
    $structTypes[typeKey] = typ;
    typ.init(pkgPath, fields);
  }
  return typ;
};

var $assertType = function(value, type, returnTuple) {
  var isInterface = (type.kind === $kindInterface), ok, missingMethod = "";
  if (value === $ifaceNil) {
    ok = false;
  } else if (!isInterface) {
    ok = value.constructor === type;
  } else {
    var valueTypeString = value.constructor.string;
    ok = type.implementedBy[valueTypeString];
    if (ok === undefined) {
      ok = true;
      var valueMethodSet = $methodSet(value.constructor);
      var interfaceMethods = type.methods;
      for (var i = 0; i < interfaceMethods.length; i++) {
        var tm = interfaceMethods[i];
        var found = false;
        for (var j = 0; j < valueMethodSet.length; j++) {
          var vm = valueMethodSet[j];
          if (vm.name === tm.name && vm.pkg === tm.pkg && vm.typ === tm.typ) {
            found = true;
            break;
          }
        }
        if (!found) {
          ok = false;
          type.missingMethodFor[valueTypeString] = tm.name;
          break;
        }
      }
      type.implementedBy[valueTypeString] = ok;
    }
    if (!ok) {
      missingMethod = type.missingMethodFor[valueTypeString];
    }
  }

  if (!ok) {
    if (returnTuple) {
      return [type.zero(), false];
    }
    $panic(new $packages["runtime"].TypeAssertionError.ptr("", (value === $ifaceNil ? "" : value.constructor.string), type.string, missingMethod));
  }

  if (!isInterface) {
    value = value.$val;
  }
  if (type === $jsObjectPtr) {
    value = value.object;
  }
  return returnTuple ? [value, true] : value;
};

var $stackDepthOffset = 0;
var $getStackDepth = function() {
  var err = new Error();
  if (err.stack === undefined) {
    return undefined;
  }
  return $stackDepthOffset + err.stack.split("\n").length;
};

var $panicStackDepth = null, $panicValue;
var $callDeferred = function(deferred, jsErr, fromPanic) {
  if (!fromPanic && deferred !== null && deferred.index >= $curGoroutine.deferStack.length) {
    throw jsErr;
  }
  if (jsErr !== null) {
    var newErr = null;
    try {
      $curGoroutine.deferStack.push(deferred);
      $panic(new $jsErrorPtr(jsErr));
    } catch (err) {
      newErr = err;
    }
    $curGoroutine.deferStack.pop();
    $callDeferred(deferred, newErr);
    return;
  }
  if ($curGoroutine.asleep) {
    return;
  }

  $stackDepthOffset--;
  var outerPanicStackDepth = $panicStackDepth;
  var outerPanicValue = $panicValue;

  var localPanicValue = $curGoroutine.panicStack.pop();
  if (localPanicValue !== undefined) {
    $panicStackDepth = $getStackDepth();
    $panicValue = localPanicValue;
  }

  try {
    while (true) {
      if (deferred === null) {
        deferred = $curGoroutine.deferStack[$curGoroutine.deferStack.length - 1];
        if (deferred === undefined) {
          /* The panic reached the top of the stack. Clear it and throw it as a JavaScript error. */
          $panicStackDepth = null;
          if (localPanicValue.Object instanceof Error) {
            throw localPanicValue.Object;
          }
          var msg;
          if (localPanicValue.constructor === $String) {
            msg = localPanicValue.$val;
          } else if (localPanicValue.Error !== undefined) {
            msg = localPanicValue.Error();
          } else if (localPanicValue.String !== undefined) {
            msg = localPanicValue.String();
          } else {
            msg = localPanicValue;
          }
          throw new Error(msg);
        }
      }
      var call = deferred.pop();
      if (call === undefined) {
        $curGoroutine.deferStack.pop();
        if (localPanicValue !== undefined) {
          deferred = null;
          continue;
        }
        return;
      }
      var r = call[0].apply(call[2], call[1]);
      if (r && r.$blk !== undefined) {
        deferred.push([r.$blk, [], r]);
        if (fromPanic) {
          throw null;
        }
        return;
      }

      if (localPanicValue !== undefined && $panicStackDepth === null) {
        throw null; /* error was recovered */
      }
    }
  } finally {
    if (localPanicValue !== undefined) {
      if ($panicStackDepth !== null) {
        $curGoroutine.panicStack.push(localPanicValue);
      }
      $panicStackDepth = outerPanicStackDepth;
      $panicValue = outerPanicValue;
    }
    $stackDepthOffset++;
  }
};

var $panic = function(value) {
  $curGoroutine.panicStack.push(value);
  $callDeferred(null, null, true);
};
var $recover = function() {
  if ($panicStackDepth === null || ($panicStackDepth !== undefined && $panicStackDepth !== $getStackDepth() - 2)) {
    return $ifaceNil;
  }
  $panicStackDepth = null;
  return $panicValue;
};
var $throw = function(err) { throw err; };

var $dummyGoroutine = { asleep: false, exit: false, deferStack: [], panicStack: [], canBlock: false };
var $curGoroutine = $dummyGoroutine, $totalGoroutines = 0, $awakeGoroutines = 0, $checkForDeadlock = true;
var $mainFinished = false;
var $go = function(fun, args, direct) {
  $totalGoroutines++;
  $awakeGoroutines++;
  var $goroutine = function() {
    try {
      $curGoroutine = $goroutine;
      var r = fun.apply(undefined, args);
      if (r && r.$blk !== undefined) {
        fun = function() { return r.$blk(); };
        args = [];
        return;
      }
      $goroutine.exit = true;
    } catch (err) {
      if (!$goroutine.exit) {
        throw err;
      }
    } finally {
      $curGoroutine = $dummyGoroutine;
      if ($goroutine.exit) { /* also set by runtime.Goexit() */
        $totalGoroutines--;
        $goroutine.asleep = true;
      }
      if ($goroutine.asleep) {
        $awakeGoroutines--;
        if (!$mainFinished && $awakeGoroutines === 0 && $checkForDeadlock) {
          console.error("fatal error: all goroutines are asleep - deadlock!");
          if ($global.process !== undefined) {
            $global.process.exit(2);
          }
        }
      }
    }
  };
  $goroutine.asleep = false;
  $goroutine.exit = false;
  $goroutine.deferStack = [];
  $goroutine.panicStack = [];
  $goroutine.canBlock = true;
  $schedule($goroutine, direct);
};

var $scheduled = [], $schedulerActive = false;
var $runScheduled = function() {
  try {
    var r;
    while ((r = $scheduled.shift()) !== undefined) {
      r();
    }
    $schedulerActive = false;
  } finally {
    if ($schedulerActive) {
      setTimeout($runScheduled, 0);
    }
  }
};
var $schedule = function(goroutine, direct) {
  if (goroutine.asleep) {
    goroutine.asleep = false;
    $awakeGoroutines++;
  }

  if (direct) {
    goroutine();
    return;
  }

  $scheduled.push(goroutine);
  if (!$schedulerActive) {
    $schedulerActive = true;
    setTimeout($runScheduled, 0);
  }
};

var $setTimeout = function(f, t) {
  $awakeGoroutines++;
  return setTimeout(function() {
    $awakeGoroutines--;
    f();
  }, t);
};

var $block = function() {
  if (!$curGoroutine.canBlock) {
    $throwRuntimeError("cannot block in JavaScript callback, fix by wrapping code in goroutine");
  }
  $curGoroutine.asleep = true;
};

var $send = function(chan, value) {
  if (chan.$closed) {
    $throwRuntimeError("send on closed channel");
  }
  var queuedRecv = chan.$recvQueue.shift();
  if (queuedRecv !== undefined) {
    queuedRecv([value, true]);
    return;
  }
  if (chan.$buffer.length < chan.$capacity) {
    chan.$buffer.push(value);
    return;
  }

  var thisGoroutine = $curGoroutine;
  var closedDuringSend;
  chan.$sendQueue.push(function(closed) {
    closedDuringSend = closed;
    $schedule(thisGoroutine);
    return value;
  });
  $block();
  return {
    $blk: function() {
      if (closedDuringSend) {
        $throwRuntimeError("send on closed channel");
      }
    }
  };
};
var $recv = function(chan) {
  var queuedSend = chan.$sendQueue.shift();
  if (queuedSend !== undefined) {
    chan.$buffer.push(queuedSend(false));
  }
  var bufferedValue = chan.$buffer.shift();
  if (bufferedValue !== undefined) {
    return [bufferedValue, true];
  }
  if (chan.$closed) {
    return [chan.$elem.zero(), false];
  }

  var thisGoroutine = $curGoroutine;
  var f = { $blk: function() { return this.value; } };
  var queueEntry = function(v) {
    f.value = v;
    $schedule(thisGoroutine);
  };
  chan.$recvQueue.push(queueEntry);
  $block();
  return f;
};
var $close = function(chan) {
  if (chan.$closed) {
    $throwRuntimeError("close of closed channel");
  }
  chan.$closed = true;
  while (true) {
    var queuedSend = chan.$sendQueue.shift();
    if (queuedSend === undefined) {
      break;
    }
    queuedSend(true); /* will panic */
  }
  while (true) {
    var queuedRecv = chan.$recvQueue.shift();
    if (queuedRecv === undefined) {
      break;
    }
    queuedRecv([chan.$elem.zero(), false]);
  }
};
var $select = function(comms) {
  var ready = [];
  var selection = -1;
  for (var i = 0; i < comms.length; i++) {
    var comm = comms[i];
    var chan = comm[0];
    switch (comm.length) {
    case 0: /* default */
      selection = i;
      break;
    case 1: /* recv */
      if (chan.$sendQueue.length !== 0 || chan.$buffer.length !== 0 || chan.$closed) {
        ready.push(i);
      }
      break;
    case 2: /* send */
      if (chan.$closed) {
        $throwRuntimeError("send on closed channel");
      }
      if (chan.$recvQueue.length !== 0 || chan.$buffer.length < chan.$capacity) {
        ready.push(i);
      }
      break;
    }
  }

  if (ready.length !== 0) {
    selection = ready[Math.floor(Math.random() * ready.length)];
  }
  if (selection !== -1) {
    var comm = comms[selection];
    switch (comm.length) {
    case 0: /* default */
      return [selection];
    case 1: /* recv */
      return [selection, $recv(comm[0])];
    case 2: /* send */
      $send(comm[0], comm[1]);
      return [selection];
    }
  }

  var entries = [];
  var thisGoroutine = $curGoroutine;
  var f = { $blk: function() { return this.selection; } };
  var removeFromQueues = function() {
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var queue = entry[0];
      var index = queue.indexOf(entry[1]);
      if (index !== -1) {
        queue.splice(index, 1);
      }
    }
  };
  for (var i = 0; i < comms.length; i++) {
    (function(i) {
      var comm = comms[i];
      switch (comm.length) {
      case 1: /* recv */
        var queueEntry = function(value) {
          f.selection = [i, value];
          removeFromQueues();
          $schedule(thisGoroutine);
        };
        entries.push([comm[0].$recvQueue, queueEntry]);
        comm[0].$recvQueue.push(queueEntry);
        break;
      case 2: /* send */
        var queueEntry = function() {
          if (comm[0].$closed) {
            $throwRuntimeError("send on closed channel");
          }
          f.selection = [i];
          removeFromQueues();
          $schedule(thisGoroutine);
          return comm[1];
        };
        entries.push([comm[0].$sendQueue, queueEntry]);
        comm[0].$sendQueue.push(queueEntry);
        break;
      }
    })(i);
  }
  $block();
  return f;
};

var $jsObjectPtr, $jsErrorPtr;

var $needsExternalization = function(t) {
  switch (t.kind) {
    case $kindBool:
    case $kindInt:
    case $kindInt8:
    case $kindInt16:
    case $kindInt32:
    case $kindUint:
    case $kindUint8:
    case $kindUint16:
    case $kindUint32:
    case $kindUintptr:
    case $kindFloat32:
    case $kindFloat64:
      return false;
    default:
      return t !== $jsObjectPtr;
  }
};

var $externalize = function(v, t) {
  if (t === $jsObjectPtr) {
    return v;
  }
  switch (t.kind) {
  case $kindBool:
  case $kindInt:
  case $kindInt8:
  case $kindInt16:
  case $kindInt32:
  case $kindUint:
  case $kindUint8:
  case $kindUint16:
  case $kindUint32:
  case $kindUintptr:
  case $kindFloat32:
  case $kindFloat64:
    return v;
  case $kindInt64:
  case $kindUint64:
    return $flatten64(v);
  case $kindArray:
    if ($needsExternalization(t.elem)) {
      return $mapArray(v, function(e) { return $externalize(e, t.elem); });
    }
    return v;
  case $kindFunc:
    return $externalizeFunction(v, t, false);
  case $kindInterface:
    if (v === $ifaceNil) {
      return null;
    }
    if (v.constructor === $jsObjectPtr) {
      return v.$val.object;
    }
    return $externalize(v.$val, v.constructor);
  case $kindMap:
    var m = {};
    var keys = $keys(v);
    for (var i = 0; i < keys.length; i++) {
      var entry = v[keys[i]];
      m[$externalize(entry.k, t.key)] = $externalize(entry.v, t.elem);
    }
    return m;
  case $kindPtr:
    if (v === t.nil) {
      return null;
    }
    return $externalize(v.$get(), t.elem);
  case $kindSlice:
    if ($needsExternalization(t.elem)) {
      return $mapArray($sliceToArray(v), function(e) { return $externalize(e, t.elem); });
    }
    return $sliceToArray(v);
  case $kindString:
    if (v.search(/^[\x00-\x7F]*$/) !== -1) {
      return v;
    }
    var s = "", r;
    for (var i = 0; i < v.length; i += r[1]) {
      r = $decodeRune(v, i);
      var c = r[0];
      if (c > 0xFFFF) {
        var h = Math.floor((c - 0x10000) / 0x400) + 0xD800;
        var l = (c - 0x10000) % 0x400 + 0xDC00;
        s += String.fromCharCode(h, l);
        continue;
      }
      s += String.fromCharCode(c);
    }
    return s;
  case $kindStruct:
    var timePkg = $packages["time"];
    if (timePkg !== undefined && v.constructor === timePkg.Time.ptr) {
      var milli = $div64(v.UnixNano(), new $Int64(0, 1000000));
      return new Date($flatten64(milli));
    }

    var noJsObject = {};
    var searchJsObject = function(v, t) {
      if (t === $jsObjectPtr) {
        return v;
      }
      switch (t.kind) {
      case $kindPtr:
        if (v === t.nil) {
          return noJsObject;
        }
        return searchJsObject(v.$get(), t.elem);
      case $kindStruct:
        var f = t.fields[0];
        return searchJsObject(v[f.prop], f.typ);
      case $kindInterface:
        return searchJsObject(v.$val, v.constructor);
      default:
        return noJsObject;
      }
    };
    var o = searchJsObject(v, t);
    if (o !== noJsObject) {
      return o;
    }

    o = {};
    for (var i = 0; i < t.fields.length; i++) {
      var f = t.fields[i];
      if (!f.exported) {
        continue;
      }
      o[f.name] = $externalize(v[f.prop], f.typ);
    }
    return o;
  }
  $throwRuntimeError("cannot externalize " + t.string);
};

var $externalizeFunction = function(v, t, passThis) {
  if (v === $throwNilPointerError) {
    return null;
  }
  if (v.$externalizeWrapper === undefined) {
    $checkForDeadlock = false;
    v.$externalizeWrapper = function() {
      var args = [];
      for (var i = 0; i < t.params.length; i++) {
        if (t.variadic && i === t.params.length - 1) {
          var vt = t.params[i].elem, varargs = [];
          for (var j = i; j < arguments.length; j++) {
            varargs.push($internalize(arguments[j], vt));
          }
          args.push(new (t.params[i])(varargs));
          break;
        }
        args.push($internalize(arguments[i], t.params[i]));
      }
      var canBlock = $curGoroutine.canBlock;
      $curGoroutine.canBlock = false;
      try {
        var result = v.apply(passThis ? this : undefined, args);
      } finally {
        $curGoroutine.canBlock = canBlock;
      }
      switch (t.results.length) {
      case 0:
        return;
      case 1:
        return $externalize(result, t.results[0]);
      default:
        for (var i = 0; i < t.results.length; i++) {
          result[i] = $externalize(result[i], t.results[i]);
        }
        return result;
      }
    };
  }
  return v.$externalizeWrapper;
};

var $internalize = function(v, t, recv) {
  if (t === $jsObjectPtr) {
    return v;
  }
  if (t === $jsObjectPtr.elem) {
    $throwRuntimeError("cannot internalize js.Object, use *js.Object instead");
  }
  if (v && v.__internal_object__ !== undefined) {
    return $assertType(v.__internal_object__, t, false);
  }
  var timePkg = $packages["time"];
  if (timePkg !== undefined && t === timePkg.Time) {
    if (!(v !== null && v !== undefined && v.constructor === Date)) {
      $throwRuntimeError("cannot internalize time.Time from " + typeof v + ", must be Date");
    }
    return timePkg.Unix(new $Int64(0, 0), new $Int64(0, v.getTime() * 1000000));
  }
  switch (t.kind) {
  case $kindBool:
    return !!v;
  case $kindInt:
    return parseInt(v);
  case $kindInt8:
    return parseInt(v) << 24 >> 24;
  case $kindInt16:
    return parseInt(v) << 16 >> 16;
  case $kindInt32:
    return parseInt(v) >> 0;
  case $kindUint:
    return parseInt(v);
  case $kindUint8:
    return parseInt(v) << 24 >>> 24;
  case $kindUint16:
    return parseInt(v) << 16 >>> 16;
  case $kindUint32:
  case $kindUintptr:
    return parseInt(v) >>> 0;
  case $kindInt64:
  case $kindUint64:
    return new t(0, v);
  case $kindFloat32:
  case $kindFloat64:
    return parseFloat(v);
  case $kindArray:
    if (v.length !== t.len) {
      $throwRuntimeError("got array with wrong size from JavaScript native");
    }
    return $mapArray(v, function(e) { return $internalize(e, t.elem); });
  case $kindFunc:
    return function() {
      var args = [];
      for (var i = 0; i < t.params.length; i++) {
        if (t.variadic && i === t.params.length - 1) {
          var vt = t.params[i].elem, varargs = arguments[i];
          for (var j = 0; j < varargs.$length; j++) {
            args.push($externalize(varargs.$array[varargs.$offset + j], vt));
          }
          break;
        }
        args.push($externalize(arguments[i], t.params[i]));
      }
      var result = v.apply(recv, args);
      switch (t.results.length) {
      case 0:
        return;
      case 1:
        return $internalize(result, t.results[0]);
      default:
        for (var i = 0; i < t.results.length; i++) {
          result[i] = $internalize(result[i], t.results[i]);
        }
        return result;
      }
    };
  case $kindInterface:
    if (t.methods.length !== 0) {
      $throwRuntimeError("cannot internalize " + t.string);
    }
    if (v === null) {
      return $ifaceNil;
    }
    if (v === undefined) {
      return new $jsObjectPtr(undefined);
    }
    switch (v.constructor) {
    case Int8Array:
      return new ($sliceType($Int8))(v);
    case Int16Array:
      return new ($sliceType($Int16))(v);
    case Int32Array:
      return new ($sliceType($Int))(v);
    case Uint8Array:
      return new ($sliceType($Uint8))(v);
    case Uint16Array:
      return new ($sliceType($Uint16))(v);
    case Uint32Array:
      return new ($sliceType($Uint))(v);
    case Float32Array:
      return new ($sliceType($Float32))(v);
    case Float64Array:
      return new ($sliceType($Float64))(v);
    case Array:
      return $internalize(v, $sliceType($emptyInterface));
    case Boolean:
      return new $Bool(!!v);
    case Date:
      if (timePkg === undefined) {
        /* time package is not present, internalize as &js.Object{Date} so it can be externalized into original Date. */
        return new $jsObjectPtr(v);
      }
      return new timePkg.Time($internalize(v, timePkg.Time));
    case Function:
      var funcType = $funcType([$sliceType($emptyInterface)], [$jsObjectPtr], true);
      return new funcType($internalize(v, funcType));
    case Number:
      return new $Float64(parseFloat(v));
    case String:
      return new $String($internalize(v, $String));
    default:
      if ($global.Node && v instanceof $global.Node) {
        return new $jsObjectPtr(v);
      }
      var mapType = $mapType($String, $emptyInterface);
      return new mapType($internalize(v, mapType));
    }
  case $kindMap:
    var m = {};
    var keys = $keys(v);
    for (var i = 0; i < keys.length; i++) {
      var k = $internalize(keys[i], t.key);
      m[t.key.keyFor(k)] = { k: k, v: $internalize(v[keys[i]], t.elem) };
    }
    return m;
  case $kindPtr:
    if (t.elem.kind === $kindStruct) {
      return $internalize(v, t.elem);
    }
  case $kindSlice:
    return new t($mapArray(v, function(e) { return $internalize(e, t.elem); }));
  case $kindString:
    v = String(v);
    if (v.search(/^[\x00-\x7F]*$/) !== -1) {
      return v;
    }
    var s = "";
    var i = 0;
    while (i < v.length) {
      var h = v.charCodeAt(i);
      if (0xD800 <= h && h <= 0xDBFF) {
        var l = v.charCodeAt(i + 1);
        var c = (h - 0xD800) * 0x400 + l - 0xDC00 + 0x10000;
        s += $encodeRune(c);
        i += 2;
        continue;
      }
      s += $encodeRune(h);
      i++;
    }
    return s;
  case $kindStruct:
    var noJsObject = {};
    var searchJsObject = function(t) {
      if (t === $jsObjectPtr) {
        return v;
      }
      if (t === $jsObjectPtr.elem) {
        $throwRuntimeError("cannot internalize js.Object, use *js.Object instead");
      }
      switch (t.kind) {
      case $kindPtr:
        return searchJsObject(t.elem);
      case $kindStruct:
        var f = t.fields[0];
        var o = searchJsObject(f.typ);
        if (o !== noJsObject) {
          var n = new t.ptr();
          n[f.prop] = o;
          return n;
        }
        return noJsObject;
      default:
        return noJsObject;
      }
    };
    var o = searchJsObject(t);
    if (o !== noJsObject) {
      return o;
    }
  }
  $throwRuntimeError("cannot internalize " + t.string);
};

$packages["github.com/gopherjs/gopherjs/js"] = (function() {
	var $pkg = {}, $init, Object, Error, sliceType, ptrType, ptrType$1, init;
	Object = $pkg.Object = $newType(0, $kindStruct, "js.Object", true, "github.com/gopherjs/gopherjs/js", true, function(object_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.object = null;
			return;
		}
		this.object = object_;
	});
	Error = $pkg.Error = $newType(0, $kindStruct, "js.Error", true, "github.com/gopherjs/gopherjs/js", true, function(Object_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Object = null;
			return;
		}
		this.Object = Object_;
	});
	sliceType = $sliceType($emptyInterface);
	ptrType = $ptrType(Object);
	ptrType$1 = $ptrType(Error);
	Object.ptr.prototype.Get = function(key) {
		var $ptr, key, o;
		o = this;
		return o.object[$externalize(key, $String)];
	};
	Object.prototype.Get = function(key) { return this.$val.Get(key); };
	Object.ptr.prototype.Set = function(key, value) {
		var $ptr, key, o, value;
		o = this;
		o.object[$externalize(key, $String)] = $externalize(value, $emptyInterface);
	};
	Object.prototype.Set = function(key, value) { return this.$val.Set(key, value); };
	Object.ptr.prototype.Delete = function(key) {
		var $ptr, key, o;
		o = this;
		delete o.object[$externalize(key, $String)];
	};
	Object.prototype.Delete = function(key) { return this.$val.Delete(key); };
	Object.ptr.prototype.Length = function() {
		var $ptr, o;
		o = this;
		return $parseInt(o.object.length);
	};
	Object.prototype.Length = function() { return this.$val.Length(); };
	Object.ptr.prototype.Index = function(i) {
		var $ptr, i, o;
		o = this;
		return o.object[i];
	};
	Object.prototype.Index = function(i) { return this.$val.Index(i); };
	Object.ptr.prototype.SetIndex = function(i, value) {
		var $ptr, i, o, value;
		o = this;
		o.object[i] = $externalize(value, $emptyInterface);
	};
	Object.prototype.SetIndex = function(i, value) { return this.$val.SetIndex(i, value); };
	Object.ptr.prototype.Call = function(name, args) {
		var $ptr, args, name, o, obj;
		o = this;
		return (obj = o.object, obj[$externalize(name, $String)].apply(obj, $externalize(args, sliceType)));
	};
	Object.prototype.Call = function(name, args) { return this.$val.Call(name, args); };
	Object.ptr.prototype.Invoke = function(args) {
		var $ptr, args, o;
		o = this;
		return o.object.apply(undefined, $externalize(args, sliceType));
	};
	Object.prototype.Invoke = function(args) { return this.$val.Invoke(args); };
	Object.ptr.prototype.New = function(args) {
		var $ptr, args, o;
		o = this;
		return new ($global.Function.prototype.bind.apply(o.object, [undefined].concat($externalize(args, sliceType))));
	};
	Object.prototype.New = function(args) { return this.$val.New(args); };
	Object.ptr.prototype.Bool = function() {
		var $ptr, o;
		o = this;
		return !!(o.object);
	};
	Object.prototype.Bool = function() { return this.$val.Bool(); };
	Object.ptr.prototype.String = function() {
		var $ptr, o;
		o = this;
		return $internalize(o.object, $String);
	};
	Object.prototype.String = function() { return this.$val.String(); };
	Object.ptr.prototype.Int = function() {
		var $ptr, o;
		o = this;
		return $parseInt(o.object) >> 0;
	};
	Object.prototype.Int = function() { return this.$val.Int(); };
	Object.ptr.prototype.Int64 = function() {
		var $ptr, o;
		o = this;
		return $internalize(o.object, $Int64);
	};
	Object.prototype.Int64 = function() { return this.$val.Int64(); };
	Object.ptr.prototype.Uint64 = function() {
		var $ptr, o;
		o = this;
		return $internalize(o.object, $Uint64);
	};
	Object.prototype.Uint64 = function() { return this.$val.Uint64(); };
	Object.ptr.prototype.Float = function() {
		var $ptr, o;
		o = this;
		return $parseFloat(o.object);
	};
	Object.prototype.Float = function() { return this.$val.Float(); };
	Object.ptr.prototype.Interface = function() {
		var $ptr, o;
		o = this;
		return $internalize(o.object, $emptyInterface);
	};
	Object.prototype.Interface = function() { return this.$val.Interface(); };
	Object.ptr.prototype.Unsafe = function() {
		var $ptr, o;
		o = this;
		return o.object;
	};
	Object.prototype.Unsafe = function() { return this.$val.Unsafe(); };
	Error.ptr.prototype.Error = function() {
		var $ptr, err;
		err = this;
		return "JavaScript error: " + $internalize(err.Object.message, $String);
	};
	Error.prototype.Error = function() { return this.$val.Error(); };
	Error.ptr.prototype.Stack = function() {
		var $ptr, err;
		err = this;
		return $internalize(err.Object.stack, $String);
	};
	Error.prototype.Stack = function() { return this.$val.Stack(); };
	init = function() {
		var $ptr, e;
		e = new Error.ptr(null);
	};
	ptrType.methods = [{prop: "Get", name: "Get", pkg: "", typ: $funcType([$String], [ptrType], false)}, {prop: "Set", name: "Set", pkg: "", typ: $funcType([$String, $emptyInterface], [], false)}, {prop: "Delete", name: "Delete", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Length", name: "Length", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "Index", name: "Index", pkg: "", typ: $funcType([$Int], [ptrType], false)}, {prop: "SetIndex", name: "SetIndex", pkg: "", typ: $funcType([$Int, $emptyInterface], [], false)}, {prop: "Call", name: "Call", pkg: "", typ: $funcType([$String, sliceType], [ptrType], true)}, {prop: "Invoke", name: "Invoke", pkg: "", typ: $funcType([sliceType], [ptrType], true)}, {prop: "New", name: "New", pkg: "", typ: $funcType([sliceType], [ptrType], true)}, {prop: "Bool", name: "Bool", pkg: "", typ: $funcType([], [$Bool], false)}, {prop: "String", name: "String", pkg: "", typ: $funcType([], [$String], false)}, {prop: "Int", name: "Int", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "Int64", name: "Int64", pkg: "", typ: $funcType([], [$Int64], false)}, {prop: "Uint64", name: "Uint64", pkg: "", typ: $funcType([], [$Uint64], false)}, {prop: "Float", name: "Float", pkg: "", typ: $funcType([], [$Float64], false)}, {prop: "Interface", name: "Interface", pkg: "", typ: $funcType([], [$emptyInterface], false)}, {prop: "Unsafe", name: "Unsafe", pkg: "", typ: $funcType([], [$Uintptr], false)}];
	ptrType$1.methods = [{prop: "Error", name: "Error", pkg: "", typ: $funcType([], [$String], false)}, {prop: "Stack", name: "Stack", pkg: "", typ: $funcType([], [$String], false)}];
	Object.init("github.com/gopherjs/gopherjs/js", [{prop: "object", name: "object", exported: false, typ: ptrType, tag: ""}]);
	Error.init("", [{prop: "Object", name: "", exported: true, typ: ptrType, tag: ""}]);
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		init();
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["runtime/internal/sys"] = (function() {
	var $pkg = {}, $init;
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["runtime"] = (function() {
	var $pkg = {}, $init, js, sys, TypeAssertionError, errorString, ptrType$3, init;
	js = $packages["github.com/gopherjs/gopherjs/js"];
	sys = $packages["runtime/internal/sys"];
	TypeAssertionError = $pkg.TypeAssertionError = $newType(0, $kindStruct, "runtime.TypeAssertionError", true, "runtime", true, function(interfaceString_, concreteString_, assertedString_, missingMethod_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.interfaceString = "";
			this.concreteString = "";
			this.assertedString = "";
			this.missingMethod = "";
			return;
		}
		this.interfaceString = interfaceString_;
		this.concreteString = concreteString_;
		this.assertedString = assertedString_;
		this.missingMethod = missingMethod_;
	});
	errorString = $pkg.errorString = $newType(8, $kindString, "runtime.errorString", true, "runtime", false, null);
	ptrType$3 = $ptrType(TypeAssertionError);
	init = function() {
		var $ptr, e, jsPkg;
		jsPkg = $packages[$externalize("github.com/gopherjs/gopherjs/js", $String)];
		$jsObjectPtr = jsPkg.Object.ptr;
		$jsErrorPtr = jsPkg.Error.ptr;
		$throwRuntimeError = (function(msg) {
			var $ptr, msg;
			$panic(new errorString(msg));
		});
		e = $ifaceNil;
		e = new TypeAssertionError.ptr("", "", "", "");
	};
	TypeAssertionError.ptr.prototype.RuntimeError = function() {
		var $ptr;
	};
	TypeAssertionError.prototype.RuntimeError = function() { return this.$val.RuntimeError(); };
	TypeAssertionError.ptr.prototype.Error = function() {
		var $ptr, e, inter;
		e = this;
		inter = e.interfaceString;
		if (inter === "") {
			inter = "interface";
		}
		if (e.concreteString === "") {
			return "interface conversion: " + inter + " is nil, not " + e.assertedString;
		}
		if (e.missingMethod === "") {
			return "interface conversion: " + inter + " is " + e.concreteString + ", not " + e.assertedString;
		}
		return "interface conversion: " + e.concreteString + " is not " + e.assertedString + ": missing method " + e.missingMethod;
	};
	TypeAssertionError.prototype.Error = function() { return this.$val.Error(); };
	errorString.prototype.RuntimeError = function() {
		var $ptr, e;
		e = this.$val;
	};
	$ptrType(errorString).prototype.RuntimeError = function() { return new errorString(this.$get()).RuntimeError(); };
	errorString.prototype.Error = function() {
		var $ptr, e;
		e = this.$val;
		return "runtime error: " + e;
	};
	$ptrType(errorString).prototype.Error = function() { return new errorString(this.$get()).Error(); };
	ptrType$3.methods = [{prop: "RuntimeError", name: "RuntimeError", pkg: "", typ: $funcType([], [], false)}, {prop: "Error", name: "Error", pkg: "", typ: $funcType([], [$String], false)}];
	errorString.methods = [{prop: "RuntimeError", name: "RuntimeError", pkg: "", typ: $funcType([], [], false)}, {prop: "Error", name: "Error", pkg: "", typ: $funcType([], [$String], false)}];
	TypeAssertionError.init("runtime", [{prop: "interfaceString", name: "interfaceString", exported: false, typ: $String, tag: ""}, {prop: "concreteString", name: "concreteString", exported: false, typ: $String, tag: ""}, {prop: "assertedString", name: "assertedString", exported: false, typ: $String, tag: ""}, {prop: "missingMethod", name: "missingMethod", exported: false, typ: $String, tag: ""}]);
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		$r = js.$init(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = sys.$init(); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		init();
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["antisocial/vendor/github.com/gopherjs/gopherjs/js"] = (function() {
	var $pkg = {}, $init, Object, Error, sliceType, ptrType, ptrType$1, init;
	Object = $pkg.Object = $newType(0, $kindStruct, "js.Object", true, "antisocial/vendor/github.com/gopherjs/gopherjs/js", true, function(object_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.object = null;
			return;
		}
		this.object = object_;
	});
	Error = $pkg.Error = $newType(0, $kindStruct, "js.Error", true, "antisocial/vendor/github.com/gopherjs/gopherjs/js", true, function(Object_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Object = null;
			return;
		}
		this.Object = Object_;
	});
	sliceType = $sliceType($emptyInterface);
	ptrType = $ptrType(Object);
	ptrType$1 = $ptrType(Error);
	Object.ptr.prototype.Get = function(key) {
		var $ptr, key, o;
		o = this;
		return o.object[$externalize(key, $String)];
	};
	Object.prototype.Get = function(key) { return this.$val.Get(key); };
	Object.ptr.prototype.Set = function(key, value) {
		var $ptr, key, o, value;
		o = this;
		o.object[$externalize(key, $String)] = $externalize(value, $emptyInterface);
	};
	Object.prototype.Set = function(key, value) { return this.$val.Set(key, value); };
	Object.ptr.prototype.Delete = function(key) {
		var $ptr, key, o;
		o = this;
		delete o.object[$externalize(key, $String)];
	};
	Object.prototype.Delete = function(key) { return this.$val.Delete(key); };
	Object.ptr.prototype.Length = function() {
		var $ptr, o;
		o = this;
		return $parseInt(o.object.length);
	};
	Object.prototype.Length = function() { return this.$val.Length(); };
	Object.ptr.prototype.Index = function(i) {
		var $ptr, i, o;
		o = this;
		return o.object[i];
	};
	Object.prototype.Index = function(i) { return this.$val.Index(i); };
	Object.ptr.prototype.SetIndex = function(i, value) {
		var $ptr, i, o, value;
		o = this;
		o.object[i] = $externalize(value, $emptyInterface);
	};
	Object.prototype.SetIndex = function(i, value) { return this.$val.SetIndex(i, value); };
	Object.ptr.prototype.Call = function(name, args) {
		var $ptr, args, name, o, obj;
		o = this;
		return (obj = o.object, obj[$externalize(name, $String)].apply(obj, $externalize(args, sliceType)));
	};
	Object.prototype.Call = function(name, args) { return this.$val.Call(name, args); };
	Object.ptr.prototype.Invoke = function(args) {
		var $ptr, args, o;
		o = this;
		return o.object.apply(undefined, $externalize(args, sliceType));
	};
	Object.prototype.Invoke = function(args) { return this.$val.Invoke(args); };
	Object.ptr.prototype.New = function(args) {
		var $ptr, args, o;
		o = this;
		return new ($global.Function.prototype.bind.apply(o.object, [undefined].concat($externalize(args, sliceType))));
	};
	Object.prototype.New = function(args) { return this.$val.New(args); };
	Object.ptr.prototype.Bool = function() {
		var $ptr, o;
		o = this;
		return !!(o.object);
	};
	Object.prototype.Bool = function() { return this.$val.Bool(); };
	Object.ptr.prototype.String = function() {
		var $ptr, o;
		o = this;
		return $internalize(o.object, $String);
	};
	Object.prototype.String = function() { return this.$val.String(); };
	Object.ptr.prototype.Int = function() {
		var $ptr, o;
		o = this;
		return $parseInt(o.object) >> 0;
	};
	Object.prototype.Int = function() { return this.$val.Int(); };
	Object.ptr.prototype.Int64 = function() {
		var $ptr, o;
		o = this;
		return $internalize(o.object, $Int64);
	};
	Object.prototype.Int64 = function() { return this.$val.Int64(); };
	Object.ptr.prototype.Uint64 = function() {
		var $ptr, o;
		o = this;
		return $internalize(o.object, $Uint64);
	};
	Object.prototype.Uint64 = function() { return this.$val.Uint64(); };
	Object.ptr.prototype.Float = function() {
		var $ptr, o;
		o = this;
		return $parseFloat(o.object);
	};
	Object.prototype.Float = function() { return this.$val.Float(); };
	Object.ptr.prototype.Interface = function() {
		var $ptr, o;
		o = this;
		return $internalize(o.object, $emptyInterface);
	};
	Object.prototype.Interface = function() { return this.$val.Interface(); };
	Object.ptr.prototype.Unsafe = function() {
		var $ptr, o;
		o = this;
		return o.object;
	};
	Object.prototype.Unsafe = function() { return this.$val.Unsafe(); };
	Error.ptr.prototype.Error = function() {
		var $ptr, err;
		err = this;
		return "JavaScript error: " + $internalize(err.Object.message, $String);
	};
	Error.prototype.Error = function() { return this.$val.Error(); };
	Error.ptr.prototype.Stack = function() {
		var $ptr, err;
		err = this;
		return $internalize(err.Object.stack, $String);
	};
	Error.prototype.Stack = function() { return this.$val.Stack(); };
	init = function() {
		var $ptr, e;
		e = new Error.ptr(null);
	};
	ptrType.methods = [{prop: "Get", name: "Get", pkg: "", typ: $funcType([$String], [ptrType], false)}, {prop: "Set", name: "Set", pkg: "", typ: $funcType([$String, $emptyInterface], [], false)}, {prop: "Delete", name: "Delete", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Length", name: "Length", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "Index", name: "Index", pkg: "", typ: $funcType([$Int], [ptrType], false)}, {prop: "SetIndex", name: "SetIndex", pkg: "", typ: $funcType([$Int, $emptyInterface], [], false)}, {prop: "Call", name: "Call", pkg: "", typ: $funcType([$String, sliceType], [ptrType], true)}, {prop: "Invoke", name: "Invoke", pkg: "", typ: $funcType([sliceType], [ptrType], true)}, {prop: "New", name: "New", pkg: "", typ: $funcType([sliceType], [ptrType], true)}, {prop: "Bool", name: "Bool", pkg: "", typ: $funcType([], [$Bool], false)}, {prop: "String", name: "String", pkg: "", typ: $funcType([], [$String], false)}, {prop: "Int", name: "Int", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "Int64", name: "Int64", pkg: "", typ: $funcType([], [$Int64], false)}, {prop: "Uint64", name: "Uint64", pkg: "", typ: $funcType([], [$Uint64], false)}, {prop: "Float", name: "Float", pkg: "", typ: $funcType([], [$Float64], false)}, {prop: "Interface", name: "Interface", pkg: "", typ: $funcType([], [$emptyInterface], false)}, {prop: "Unsafe", name: "Unsafe", pkg: "", typ: $funcType([], [$Uintptr], false)}];
	ptrType$1.methods = [{prop: "Error", name: "Error", pkg: "", typ: $funcType([], [$String], false)}, {prop: "Stack", name: "Stack", pkg: "", typ: $funcType([], [$String], false)}];
	Object.init("antisocial/vendor/github.com/gopherjs/gopherjs/js", [{prop: "object", name: "object", exported: false, typ: ptrType, tag: ""}]);
	Error.init("", [{prop: "Object", name: "", exported: true, typ: ptrType, tag: ""}]);
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		init();
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["antisocial/vendor/github.com/gopherjs/jquery"] = (function() {
	var $pkg = {}, $init, js, JQuery, Event, JQueryCoordinates, sliceType, funcType$1, mapType, sliceType$1, funcType$2, funcType$3, ptrType, sliceType$2, ptrType$1, NewJQuery, Trim;
	js = $packages["antisocial/vendor/github.com/gopherjs/gopherjs/js"];
	JQuery = $pkg.JQuery = $newType(0, $kindStruct, "jquery.JQuery", true, "antisocial/vendor/github.com/gopherjs/jquery", true, function(o_, Jquery_, Selector_, Length_, Context_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.o = null;
			this.Jquery = "";
			this.Selector = "";
			this.Length = 0;
			this.Context = "";
			return;
		}
		this.o = o_;
		this.Jquery = Jquery_;
		this.Selector = Selector_;
		this.Length = Length_;
		this.Context = Context_;
	});
	Event = $pkg.Event = $newType(0, $kindStruct, "jquery.Event", true, "antisocial/vendor/github.com/gopherjs/jquery", true, function(Object_, KeyCode_, Target_, CurrentTarget_, DelegateTarget_, RelatedTarget_, Data_, Result_, Which_, Namespace_, MetaKey_, PageX_, PageY_, Type_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Object = null;
			this.KeyCode = 0;
			this.Target = null;
			this.CurrentTarget = null;
			this.DelegateTarget = null;
			this.RelatedTarget = null;
			this.Data = null;
			this.Result = null;
			this.Which = 0;
			this.Namespace = "";
			this.MetaKey = false;
			this.PageX = 0;
			this.PageY = 0;
			this.Type = "";
			return;
		}
		this.Object = Object_;
		this.KeyCode = KeyCode_;
		this.Target = Target_;
		this.CurrentTarget = CurrentTarget_;
		this.DelegateTarget = DelegateTarget_;
		this.RelatedTarget = RelatedTarget_;
		this.Data = Data_;
		this.Result = Result_;
		this.Which = Which_;
		this.Namespace = Namespace_;
		this.MetaKey = MetaKey_;
		this.PageX = PageX_;
		this.PageY = PageY_;
		this.Type = Type_;
	});
	JQueryCoordinates = $pkg.JQueryCoordinates = $newType(0, $kindStruct, "jquery.JQueryCoordinates", true, "antisocial/vendor/github.com/gopherjs/jquery", true, function(Left_, Top_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Left = 0;
			this.Top = 0;
			return;
		}
		this.Left = Left_;
		this.Top = Top_;
	});
	sliceType = $sliceType($emptyInterface);
	funcType$1 = $funcType([$Int, $emptyInterface], [], false);
	mapType = $mapType($String, $emptyInterface);
	sliceType$1 = $sliceType($String);
	funcType$2 = $funcType([$Int, $String], [$String], false);
	funcType$3 = $funcType([], [], false);
	ptrType = $ptrType(js.Object);
	sliceType$2 = $sliceType($Bool);
	ptrType$1 = $ptrType(Event);
	Event.ptr.prototype.PreventDefault = function() {
		var $ptr, event;
		event = this;
		event.Object.preventDefault();
	};
	Event.prototype.PreventDefault = function() { return this.$val.PreventDefault(); };
	Event.ptr.prototype.IsDefaultPrevented = function() {
		var $ptr, event;
		event = this;
		return !!(event.Object.isDefaultPrevented());
	};
	Event.prototype.IsDefaultPrevented = function() { return this.$val.IsDefaultPrevented(); };
	Event.ptr.prototype.IsImmediatePropogationStopped = function() {
		var $ptr, event;
		event = this;
		return !!(event.Object.isImmediatePropogationStopped());
	};
	Event.prototype.IsImmediatePropogationStopped = function() { return this.$val.IsImmediatePropogationStopped(); };
	Event.ptr.prototype.IsPropagationStopped = function() {
		var $ptr, event;
		event = this;
		return !!(event.Object.isPropagationStopped());
	};
	Event.prototype.IsPropagationStopped = function() { return this.$val.IsPropagationStopped(); };
	Event.ptr.prototype.StopImmediatePropagation = function() {
		var $ptr, event;
		event = this;
		event.Object.stopImmediatePropagation();
	};
	Event.prototype.StopImmediatePropagation = function() { return this.$val.StopImmediatePropagation(); };
	Event.ptr.prototype.StopPropagation = function() {
		var $ptr, event;
		event = this;
		event.Object.stopPropagation();
	};
	Event.prototype.StopPropagation = function() { return this.$val.StopPropagation(); };
	NewJQuery = function(args) {
		var $ptr, args;
		return new JQuery.ptr(new ($global.Function.prototype.bind.apply($global.jQuery, [undefined].concat($externalize(args, sliceType)))), "", "", 0, "");
	};
	$pkg.NewJQuery = NewJQuery;
	Trim = function(text) {
		var $ptr, text;
		return $internalize($global.jQuery.trim($externalize(text, $String)), $String);
	};
	$pkg.Trim = Trim;
	JQuery.ptr.prototype.Each = function(fn) {
		var $ptr, fn, j;
		j = $clone(this, JQuery);
		j.o = j.o.each($externalize(fn, funcType$1));
		return j;
	};
	JQuery.prototype.Each = function(fn) { return this.$val.Each(fn); };
	JQuery.ptr.prototype.Call = function(name, args) {
		var $ptr, args, j, name, obj;
		j = $clone(this, JQuery);
		return NewJQuery(new sliceType([new $jsObjectPtr((obj = j.o, obj[$externalize(name, $String)].apply(obj, $externalize(args, sliceType))))]));
	};
	JQuery.prototype.Call = function(name, args) { return this.$val.Call(name, args); };
	JQuery.ptr.prototype.Underlying = function() {
		var $ptr, j;
		j = $clone(this, JQuery);
		return j.o;
	};
	JQuery.prototype.Underlying = function() { return this.$val.Underlying(); };
	JQuery.ptr.prototype.Get = function(i) {
		var $ptr, i, j, obj;
		j = $clone(this, JQuery);
		return (obj = j.o, obj.get.apply(obj, $externalize(i, sliceType)));
	};
	JQuery.prototype.Get = function(i) { return this.$val.Get(i); };
	JQuery.ptr.prototype.Append = function(i) {
		var $ptr, i, j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.append.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Append = function(i) { return this.$val.Append(i); };
	JQuery.ptr.prototype.Empty = function() {
		var $ptr, j;
		j = $clone(this, JQuery);
		j.o = j.o.empty();
		return j;
	};
	JQuery.prototype.Empty = function() { return this.$val.Empty(); };
	JQuery.ptr.prototype.Detach = function(i) {
		var $ptr, i, j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.detach.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Detach = function(i) { return this.$val.Detach(i); };
	JQuery.ptr.prototype.Eq = function(idx) {
		var $ptr, idx, j;
		j = $clone(this, JQuery);
		j.o = j.o.eq(idx);
		return j;
	};
	JQuery.prototype.Eq = function(idx) { return this.$val.Eq(idx); };
	JQuery.ptr.prototype.FadeIn = function(i) {
		var $ptr, i, j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.fadeIn.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.FadeIn = function(i) { return this.$val.FadeIn(i); };
	JQuery.ptr.prototype.Delay = function(i) {
		var $ptr, i, j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.delay.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Delay = function(i) { return this.$val.Delay(i); };
	JQuery.ptr.prototype.ToArray = function() {
		var $ptr, j;
		j = $clone(this, JQuery);
		return $assertType($internalize(j.o.toArray(), $emptyInterface), sliceType);
	};
	JQuery.prototype.ToArray = function() { return this.$val.ToArray(); };
	JQuery.ptr.prototype.Remove = function(i) {
		var $ptr, i, j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.remove.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Remove = function(i) { return this.$val.Remove(i); };
	JQuery.ptr.prototype.Stop = function(i) {
		var $ptr, i, j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.stop.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Stop = function(i) { return this.$val.Stop(i); };
	JQuery.ptr.prototype.AddBack = function(i) {
		var $ptr, i, j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.addBack.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.AddBack = function(i) { return this.$val.AddBack(i); };
	JQuery.ptr.prototype.Css = function(name) {
		var $ptr, j, name;
		j = $clone(this, JQuery);
		return $internalize(j.o.css($externalize(name, $String)), $String);
	};
	JQuery.prototype.Css = function(name) { return this.$val.Css(name); };
	JQuery.ptr.prototype.CssArray = function(arr) {
		var $ptr, arr, j;
		j = $clone(this, JQuery);
		return $assertType($internalize(j.o.css($externalize(arr, sliceType$1)), $emptyInterface), mapType);
	};
	JQuery.prototype.CssArray = function(arr) { return this.$val.CssArray(arr); };
	JQuery.ptr.prototype.SetCss = function(i) {
		var $ptr, i, j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.css.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.SetCss = function(i) { return this.$val.SetCss(i); };
	JQuery.ptr.prototype.Text = function() {
		var $ptr, j;
		j = $clone(this, JQuery);
		return $internalize(j.o.text(), $String);
	};
	JQuery.prototype.Text = function() { return this.$val.Text(); };
	JQuery.ptr.prototype.SetText = function(i) {
		var $ptr, _ref, i, j;
		j = $clone(this, JQuery);
		_ref = i;
		if ($assertType(_ref, funcType$2, true)[1] || $assertType(_ref, $String, true)[1]) {
		} else {
			console.log("SetText Argument should be 'string' or 'func(int, string) string'");
		}
		j.o = j.o.text($externalize(i, $emptyInterface));
		return j;
	};
	JQuery.prototype.SetText = function(i) { return this.$val.SetText(i); };
	JQuery.ptr.prototype.Val = function() {
		var $ptr, j;
		j = $clone(this, JQuery);
		return $internalize(j.o.val(), $String);
	};
	JQuery.prototype.Val = function() { return this.$val.Val(); };
	JQuery.ptr.prototype.SetVal = function(i) {
		var $ptr, i, j;
		j = $clone(this, JQuery);
		j.o.val($externalize(i, $emptyInterface));
		return j;
	};
	JQuery.prototype.SetVal = function(i) { return this.$val.SetVal(i); };
	JQuery.ptr.prototype.Prop = function(property) {
		var $ptr, j, property;
		j = $clone(this, JQuery);
		return $internalize(j.o.prop($externalize(property, $String)), $emptyInterface);
	};
	JQuery.prototype.Prop = function(property) { return this.$val.Prop(property); };
	JQuery.ptr.prototype.SetProp = function(i) {
		var $ptr, i, j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.prop.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.SetProp = function(i) { return this.$val.SetProp(i); };
	JQuery.ptr.prototype.RemoveProp = function(property) {
		var $ptr, j, property;
		j = $clone(this, JQuery);
		j.o = j.o.removeProp($externalize(property, $String));
		return j;
	};
	JQuery.prototype.RemoveProp = function(property) { return this.$val.RemoveProp(property); };
	JQuery.ptr.prototype.Attr = function(property) {
		var $ptr, attr, j, property;
		j = $clone(this, JQuery);
		attr = j.o.attr($externalize(property, $String));
		if (attr === undefined) {
			return "";
		}
		return $internalize(attr, $String);
	};
	JQuery.prototype.Attr = function(property) { return this.$val.Attr(property); };
	JQuery.ptr.prototype.SetAttr = function(i) {
		var $ptr, i, j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.attr.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.SetAttr = function(i) { return this.$val.SetAttr(i); };
	JQuery.ptr.prototype.RemoveAttr = function(property) {
		var $ptr, j, property;
		j = $clone(this, JQuery);
		j.o = j.o.removeAttr($externalize(property, $String));
		return j;
	};
	JQuery.prototype.RemoveAttr = function(property) { return this.$val.RemoveAttr(property); };
	JQuery.ptr.prototype.HasClass = function(class$1) {
		var $ptr, class$1, j;
		j = $clone(this, JQuery);
		return !!(j.o.hasClass($externalize(class$1, $String)));
	};
	JQuery.prototype.HasClass = function(class$1) { return this.$val.HasClass(class$1); };
	JQuery.ptr.prototype.AddClass = function(i) {
		var $ptr, _ref, i, j;
		j = $clone(this, JQuery);
		_ref = i;
		if ($assertType(_ref, funcType$2, true)[1] || $assertType(_ref, $String, true)[1]) {
		} else {
			console.log("addClass Argument should be 'string' or 'func(int, string) string'");
		}
		j.o = j.o.addClass($externalize(i, $emptyInterface));
		return j;
	};
	JQuery.prototype.AddClass = function(i) { return this.$val.AddClass(i); };
	JQuery.ptr.prototype.RemoveClass = function(property) {
		var $ptr, j, property;
		j = $clone(this, JQuery);
		j.o = j.o.removeClass($externalize(property, $String));
		return j;
	};
	JQuery.prototype.RemoveClass = function(property) { return this.$val.RemoveClass(property); };
	JQuery.ptr.prototype.ToggleClass = function(i) {
		var $ptr, i, j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.toggleClass.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.ToggleClass = function(i) { return this.$val.ToggleClass(i); };
	JQuery.ptr.prototype.Focus = function() {
		var $ptr, j;
		j = $clone(this, JQuery);
		j.o = j.o.focus();
		return j;
	};
	JQuery.prototype.Focus = function() { return this.$val.Focus(); };
	JQuery.ptr.prototype.Blur = function() {
		var $ptr, j;
		j = $clone(this, JQuery);
		j.o = j.o.blur();
		return j;
	};
	JQuery.prototype.Blur = function() { return this.$val.Blur(); };
	JQuery.ptr.prototype.ReplaceAll = function(i) {
		var $ptr, i, j;
		j = $clone(this, JQuery);
		j.o = j.o.replaceAll($externalize(i, $emptyInterface));
		return j;
	};
	JQuery.prototype.ReplaceAll = function(i) { return this.$val.ReplaceAll(i); };
	JQuery.ptr.prototype.ReplaceWith = function(i) {
		var $ptr, i, j;
		j = $clone(this, JQuery);
		j.o = j.o.replaceWith($externalize(i, $emptyInterface));
		return j;
	};
	JQuery.prototype.ReplaceWith = function(i) { return this.$val.ReplaceWith(i); };
	JQuery.ptr.prototype.After = function(i) {
		var $ptr, i, j;
		j = $clone(this, JQuery);
		j.o = j.o.after($externalize(i, sliceType));
		return j;
	};
	JQuery.prototype.After = function(i) { return this.$val.After(i); };
	JQuery.ptr.prototype.Before = function(i) {
		var $ptr, i, j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.before.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Before = function(i) { return this.$val.Before(i); };
	JQuery.ptr.prototype.Prepend = function(i) {
		var $ptr, i, j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.prepend.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Prepend = function(i) { return this.$val.Prepend(i); };
	JQuery.ptr.prototype.PrependTo = function(i) {
		var $ptr, i, j;
		j = $clone(this, JQuery);
		j.o = j.o.prependTo($externalize(i, $emptyInterface));
		return j;
	};
	JQuery.prototype.PrependTo = function(i) { return this.$val.PrependTo(i); };
	JQuery.ptr.prototype.AppendTo = function(i) {
		var $ptr, i, j;
		j = $clone(this, JQuery);
		j.o = j.o.appendTo($externalize(i, $emptyInterface));
		return j;
	};
	JQuery.prototype.AppendTo = function(i) { return this.$val.AppendTo(i); };
	JQuery.ptr.prototype.InsertAfter = function(i) {
		var $ptr, i, j;
		j = $clone(this, JQuery);
		j.o = j.o.insertAfter($externalize(i, $emptyInterface));
		return j;
	};
	JQuery.prototype.InsertAfter = function(i) { return this.$val.InsertAfter(i); };
	JQuery.ptr.prototype.InsertBefore = function(i) {
		var $ptr, i, j;
		j = $clone(this, JQuery);
		j.o = j.o.insertBefore($externalize(i, $emptyInterface));
		return j;
	};
	JQuery.prototype.InsertBefore = function(i) { return this.$val.InsertBefore(i); };
	JQuery.ptr.prototype.Show = function(i) {
		var $ptr, i, j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.show.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Show = function(i) { return this.$val.Show(i); };
	JQuery.ptr.prototype.Hide = function(i) {
		var $ptr, i, j, obj;
		j = $clone(this, JQuery);
		(obj = j.o, obj.hide.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Hide = function(i) { return this.$val.Hide(i); };
	JQuery.ptr.prototype.Toggle = function(i) {
		var $ptr, i, j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.toggle.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Toggle = function(i) { return this.$val.Toggle(i); };
	JQuery.ptr.prototype.Contents = function() {
		var $ptr, j;
		j = $clone(this, JQuery);
		j.o = j.o.contents();
		return j;
	};
	JQuery.prototype.Contents = function() { return this.$val.Contents(); };
	JQuery.ptr.prototype.Html = function() {
		var $ptr, j;
		j = $clone(this, JQuery);
		return $internalize(j.o.html(), $String);
	};
	JQuery.prototype.Html = function() { return this.$val.Html(); };
	JQuery.ptr.prototype.SetHtml = function(i) {
		var $ptr, _ref, i, j;
		j = $clone(this, JQuery);
		_ref = i;
		if ($assertType(_ref, funcType$2, true)[1] || $assertType(_ref, $String, true)[1]) {
		} else {
			console.log("SetHtml Argument should be 'string' or 'func(int, string) string'");
		}
		j.o = j.o.html($externalize(i, $emptyInterface));
		return j;
	};
	JQuery.prototype.SetHtml = function(i) { return this.$val.SetHtml(i); };
	JQuery.ptr.prototype.Closest = function(i) {
		var $ptr, i, j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.closest.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Closest = function(i) { return this.$val.Closest(i); };
	JQuery.ptr.prototype.End = function() {
		var $ptr, j;
		j = $clone(this, JQuery);
		j.o = j.o.end();
		return j;
	};
	JQuery.prototype.End = function() { return this.$val.End(); };
	JQuery.ptr.prototype.Add = function(i) {
		var $ptr, i, j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.add.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Add = function(i) { return this.$val.Add(i); };
	JQuery.ptr.prototype.Clone = function(b) {
		var $ptr, b, j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.clone.apply(obj, $externalize(b, sliceType)));
		return j;
	};
	JQuery.prototype.Clone = function(b) { return this.$val.Clone(b); };
	JQuery.ptr.prototype.Height = function() {
		var $ptr, j;
		j = $clone(this, JQuery);
		return $parseInt(j.o.height()) >> 0;
	};
	JQuery.prototype.Height = function() { return this.$val.Height(); };
	JQuery.ptr.prototype.SetHeight = function(value) {
		var $ptr, j, value;
		j = $clone(this, JQuery);
		j.o = j.o.height($externalize(value, $String));
		return j;
	};
	JQuery.prototype.SetHeight = function(value) { return this.$val.SetHeight(value); };
	JQuery.ptr.prototype.Width = function() {
		var $ptr, j;
		j = $clone(this, JQuery);
		return $parseInt(j.o.width()) >> 0;
	};
	JQuery.prototype.Width = function() { return this.$val.Width(); };
	JQuery.ptr.prototype.SetWidth = function(i) {
		var $ptr, _ref, i, j;
		j = $clone(this, JQuery);
		_ref = i;
		if ($assertType(_ref, funcType$2, true)[1] || $assertType(_ref, $String, true)[1]) {
		} else {
			console.log("SetWidth Argument should be 'string' or 'func(int, string) string'");
		}
		j.o = j.o.width($externalize(i, $emptyInterface));
		return j;
	};
	JQuery.prototype.SetWidth = function(i) { return this.$val.SetWidth(i); };
	JQuery.ptr.prototype.InnerHeight = function() {
		var $ptr, j;
		j = $clone(this, JQuery);
		return $parseInt(j.o.innerHeight()) >> 0;
	};
	JQuery.prototype.InnerHeight = function() { return this.$val.InnerHeight(); };
	JQuery.ptr.prototype.InnerWidth = function() {
		var $ptr, j;
		j = $clone(this, JQuery);
		return $parseInt(j.o.innerWidth()) >> 0;
	};
	JQuery.prototype.InnerWidth = function() { return this.$val.InnerWidth(); };
	JQuery.ptr.prototype.Offset = function() {
		var $ptr, j, obj;
		j = $clone(this, JQuery);
		obj = j.o.offset();
		return new JQueryCoordinates.ptr($parseInt(obj.left) >> 0, $parseInt(obj.top) >> 0);
	};
	JQuery.prototype.Offset = function() { return this.$val.Offset(); };
	JQuery.ptr.prototype.SetOffset = function(jc) {
		var $ptr, j, jc;
		jc = $clone(jc, JQueryCoordinates);
		j = $clone(this, JQuery);
		j.o = j.o.offset($externalize(jc, JQueryCoordinates));
		return j;
	};
	JQuery.prototype.SetOffset = function(jc) { return this.$val.SetOffset(jc); };
	JQuery.ptr.prototype.OuterHeight = function(includeMargin) {
		var $ptr, includeMargin, j;
		j = $clone(this, JQuery);
		if (includeMargin.$length === 0) {
			return $parseInt(j.o.outerHeight()) >> 0;
		}
		return $parseInt(j.o.outerHeight($externalize((0 >= includeMargin.$length ? $throwRuntimeError("index out of range") : includeMargin.$array[includeMargin.$offset + 0]), $Bool))) >> 0;
	};
	JQuery.prototype.OuterHeight = function(includeMargin) { return this.$val.OuterHeight(includeMargin); };
	JQuery.ptr.prototype.OuterWidth = function(includeMargin) {
		var $ptr, includeMargin, j;
		j = $clone(this, JQuery);
		if (includeMargin.$length === 0) {
			return $parseInt(j.o.outerWidth()) >> 0;
		}
		return $parseInt(j.o.outerWidth($externalize((0 >= includeMargin.$length ? $throwRuntimeError("index out of range") : includeMargin.$array[includeMargin.$offset + 0]), $Bool))) >> 0;
	};
	JQuery.prototype.OuterWidth = function(includeMargin) { return this.$val.OuterWidth(includeMargin); };
	JQuery.ptr.prototype.Position = function() {
		var $ptr, j, obj;
		j = $clone(this, JQuery);
		obj = j.o.position();
		return new JQueryCoordinates.ptr($parseInt(obj.left) >> 0, $parseInt(obj.top) >> 0);
	};
	JQuery.prototype.Position = function() { return this.$val.Position(); };
	JQuery.ptr.prototype.ScrollLeft = function() {
		var $ptr, j;
		j = $clone(this, JQuery);
		return $parseInt(j.o.scrollLeft()) >> 0;
	};
	JQuery.prototype.ScrollLeft = function() { return this.$val.ScrollLeft(); };
	JQuery.ptr.prototype.SetScrollLeft = function(value) {
		var $ptr, j, value;
		j = $clone(this, JQuery);
		j.o = j.o.scrollLeft(value);
		return j;
	};
	JQuery.prototype.SetScrollLeft = function(value) { return this.$val.SetScrollLeft(value); };
	JQuery.ptr.prototype.ScrollTop = function() {
		var $ptr, j;
		j = $clone(this, JQuery);
		return $parseInt(j.o.scrollTop()) >> 0;
	};
	JQuery.prototype.ScrollTop = function() { return this.$val.ScrollTop(); };
	JQuery.ptr.prototype.SetScrollTop = function(value) {
		var $ptr, j, value;
		j = $clone(this, JQuery);
		j.o = j.o.scrollTop(value);
		return j;
	};
	JQuery.prototype.SetScrollTop = function(value) { return this.$val.SetScrollTop(value); };
	JQuery.ptr.prototype.ClearQueue = function(queueName) {
		var $ptr, j, queueName;
		j = $clone(this, JQuery);
		j.o = j.o.clearQueue($externalize(queueName, $String));
		return j;
	};
	JQuery.prototype.ClearQueue = function(queueName) { return this.$val.ClearQueue(queueName); };
	JQuery.ptr.prototype.SetData = function(key, value) {
		var $ptr, j, key, value;
		j = $clone(this, JQuery);
		j.o = j.o.data($externalize(key, $String), $externalize(value, $emptyInterface));
		return j;
	};
	JQuery.prototype.SetData = function(key, value) { return this.$val.SetData(key, value); };
	JQuery.ptr.prototype.Data = function(key) {
		var $ptr, j, key, result;
		j = $clone(this, JQuery);
		result = j.o.data($externalize(key, $String));
		if (result === undefined) {
			return $ifaceNil;
		}
		return $internalize(result, $emptyInterface);
	};
	JQuery.prototype.Data = function(key) { return this.$val.Data(key); };
	JQuery.ptr.prototype.Dequeue = function(queueName) {
		var $ptr, j, queueName;
		j = $clone(this, JQuery);
		j.o = j.o.dequeue($externalize(queueName, $String));
		return j;
	};
	JQuery.prototype.Dequeue = function(queueName) { return this.$val.Dequeue(queueName); };
	JQuery.ptr.prototype.RemoveData = function(name) {
		var $ptr, j, name;
		j = $clone(this, JQuery);
		j.o = j.o.removeData($externalize(name, $String));
		return j;
	};
	JQuery.prototype.RemoveData = function(name) { return this.$val.RemoveData(name); };
	JQuery.ptr.prototype.OffsetParent = function() {
		var $ptr, j;
		j = $clone(this, JQuery);
		j.o = j.o.offsetParent();
		return j;
	};
	JQuery.prototype.OffsetParent = function() { return this.$val.OffsetParent(); };
	JQuery.ptr.prototype.Parent = function(i) {
		var $ptr, i, j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.parent.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Parent = function(i) { return this.$val.Parent(i); };
	JQuery.ptr.prototype.Parents = function(i) {
		var $ptr, i, j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.parents.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Parents = function(i) { return this.$val.Parents(i); };
	JQuery.ptr.prototype.ParentsUntil = function(i) {
		var $ptr, i, j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.parentsUntil.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.ParentsUntil = function(i) { return this.$val.ParentsUntil(i); };
	JQuery.ptr.prototype.Prev = function(i) {
		var $ptr, i, j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.prev.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Prev = function(i) { return this.$val.Prev(i); };
	JQuery.ptr.prototype.PrevAll = function(i) {
		var $ptr, i, j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.prevAll.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.PrevAll = function(i) { return this.$val.PrevAll(i); };
	JQuery.ptr.prototype.PrevUntil = function(i) {
		var $ptr, i, j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.prevUntil.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.PrevUntil = function(i) { return this.$val.PrevUntil(i); };
	JQuery.ptr.prototype.Siblings = function(i) {
		var $ptr, i, j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.siblings.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Siblings = function(i) { return this.$val.Siblings(i); };
	JQuery.ptr.prototype.Slice = function(i) {
		var $ptr, i, j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.slice.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Slice = function(i) { return this.$val.Slice(i); };
	JQuery.ptr.prototype.Children = function(selector) {
		var $ptr, j, selector;
		j = $clone(this, JQuery);
		j.o = j.o.children($externalize(selector, $emptyInterface));
		return j;
	};
	JQuery.prototype.Children = function(selector) { return this.$val.Children(selector); };
	JQuery.ptr.prototype.Unwrap = function() {
		var $ptr, j;
		j = $clone(this, JQuery);
		j.o = j.o.unwrap();
		return j;
	};
	JQuery.prototype.Unwrap = function() { return this.$val.Unwrap(); };
	JQuery.ptr.prototype.Wrap = function(obj) {
		var $ptr, j, obj;
		j = $clone(this, JQuery);
		j.o = j.o.wrap($externalize(obj, $emptyInterface));
		return j;
	};
	JQuery.prototype.Wrap = function(obj) { return this.$val.Wrap(obj); };
	JQuery.ptr.prototype.WrapAll = function(i) {
		var $ptr, i, j;
		j = $clone(this, JQuery);
		j.o = j.o.wrapAll($externalize(i, $emptyInterface));
		return j;
	};
	JQuery.prototype.WrapAll = function(i) { return this.$val.WrapAll(i); };
	JQuery.ptr.prototype.WrapInner = function(i) {
		var $ptr, i, j;
		j = $clone(this, JQuery);
		j.o = j.o.wrapInner($externalize(i, $emptyInterface));
		return j;
	};
	JQuery.prototype.WrapInner = function(i) { return this.$val.WrapInner(i); };
	JQuery.ptr.prototype.Next = function(i) {
		var $ptr, i, j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.next.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Next = function(i) { return this.$val.Next(i); };
	JQuery.ptr.prototype.NextAll = function(i) {
		var $ptr, i, j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.nextAll.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.NextAll = function(i) { return this.$val.NextAll(i); };
	JQuery.ptr.prototype.NextUntil = function(i) {
		var $ptr, i, j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.nextUntil.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.NextUntil = function(i) { return this.$val.NextUntil(i); };
	JQuery.ptr.prototype.Not = function(i) {
		var $ptr, i, j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.not.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Not = function(i) { return this.$val.Not(i); };
	JQuery.ptr.prototype.Filter = function(i) {
		var $ptr, i, j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.filter.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Filter = function(i) { return this.$val.Filter(i); };
	JQuery.ptr.prototype.Find = function(i) {
		var $ptr, i, j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.find.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Find = function(i) { return this.$val.Find(i); };
	JQuery.ptr.prototype.First = function() {
		var $ptr, j;
		j = $clone(this, JQuery);
		j.o = j.o.first();
		return j;
	};
	JQuery.prototype.First = function() { return this.$val.First(); };
	JQuery.ptr.prototype.Has = function(selector) {
		var $ptr, j, selector;
		j = $clone(this, JQuery);
		j.o = j.o.has($externalize(selector, $String));
		return j;
	};
	JQuery.prototype.Has = function(selector) { return this.$val.Has(selector); };
	JQuery.ptr.prototype.Is = function(i) {
		var $ptr, i, j, obj;
		j = $clone(this, JQuery);
		return !!((obj = j.o, obj.is.apply(obj, $externalize(i, sliceType))));
	};
	JQuery.prototype.Is = function(i) { return this.$val.Is(i); };
	JQuery.ptr.prototype.Last = function() {
		var $ptr, j;
		j = $clone(this, JQuery);
		j.o = j.o.last();
		return j;
	};
	JQuery.prototype.Last = function() { return this.$val.Last(); };
	JQuery.ptr.prototype.Ready = function(handler) {
		var $ptr, handler, j;
		j = $clone(this, JQuery);
		j.o = j.o.ready($externalize(handler, funcType$3));
		return j;
	};
	JQuery.prototype.Ready = function(handler) { return this.$val.Ready(handler); };
	JQuery.ptr.prototype.Resize = function(i) {
		var $ptr, i, j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.resize.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Resize = function(i) { return this.$val.Resize(i); };
	JQuery.ptr.prototype.Scroll = function(i) {
		var $ptr, i, j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.scroll.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Scroll = function(i) { return this.$val.Scroll(i); };
	JQuery.ptr.prototype.FadeOut = function(i) {
		var $ptr, i, j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.fadeOut.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.FadeOut = function(i) { return this.$val.FadeOut(i); };
	JQuery.ptr.prototype.FadeToggle = function(i) {
		var $ptr, i, j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.fadeToggle.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.FadeToggle = function(i) { return this.$val.FadeToggle(i); };
	JQuery.ptr.prototype.SlideDown = function(i) {
		var $ptr, i, j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.slideDown.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.SlideDown = function(i) { return this.$val.SlideDown(i); };
	JQuery.ptr.prototype.SlideToggle = function(i) {
		var $ptr, i, j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.slideToggle.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.SlideToggle = function(i) { return this.$val.SlideToggle(i); };
	JQuery.ptr.prototype.SlideUp = function(i) {
		var $ptr, i, j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.slideUp.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.SlideUp = function(i) { return this.$val.SlideUp(i); };
	JQuery.ptr.prototype.Select = function(i) {
		var $ptr, i, j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.select.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Select = function(i) { return this.$val.Select(i); };
	JQuery.ptr.prototype.Submit = function(i) {
		var $ptr, i, j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.submit.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Submit = function(i) { return this.$val.Submit(i); };
	JQuery.ptr.prototype.Trigger = function(i) {
		var $ptr, i, j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.trigger.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Trigger = function(i) { return this.$val.Trigger(i); };
	JQuery.ptr.prototype.On = function(i) {
		var $ptr, i, j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.on.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.On = function(i) { return this.$val.On(i); };
	JQuery.ptr.prototype.One = function(i) {
		var $ptr, i, j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.one.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.One = function(i) { return this.$val.One(i); };
	JQuery.ptr.prototype.Off = function(i) {
		var $ptr, i, j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.off.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Off = function(i) { return this.$val.Off(i); };
	JQuery.ptr.prototype.Load = function(i) {
		var $ptr, i, j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.load.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Load = function(i) { return this.$val.Load(i); };
	JQuery.ptr.prototype.Serialize = function() {
		var $ptr, j;
		j = $clone(this, JQuery);
		return $internalize(j.o.serialize(), $String);
	};
	JQuery.prototype.Serialize = function() { return this.$val.Serialize(); };
	JQuery.ptr.prototype.SerializeArray = function() {
		var $ptr, j;
		j = $clone(this, JQuery);
		return j.o.serializeArray();
	};
	JQuery.prototype.SerializeArray = function() { return this.$val.SerializeArray(); };
	JQuery.methods = [{prop: "Each", name: "Each", pkg: "", typ: $funcType([funcType$1], [JQuery], false)}, {prop: "Call", name: "Call", pkg: "", typ: $funcType([$String, sliceType], [JQuery], true)}, {prop: "Underlying", name: "Underlying", pkg: "", typ: $funcType([], [ptrType], false)}, {prop: "Get", name: "Get", pkg: "", typ: $funcType([sliceType], [ptrType], true)}, {prop: "Append", name: "Append", pkg: "", typ: $funcType([sliceType], [JQuery], true)}, {prop: "Empty", name: "Empty", pkg: "", typ: $funcType([], [JQuery], false)}, {prop: "Detach", name: "Detach", pkg: "", typ: $funcType([sliceType], [JQuery], true)}, {prop: "Eq", name: "Eq", pkg: "", typ: $funcType([$Int], [JQuery], false)}, {prop: "FadeIn", name: "FadeIn", pkg: "", typ: $funcType([sliceType], [JQuery], true)}, {prop: "Delay", name: "Delay", pkg: "", typ: $funcType([sliceType], [JQuery], true)}, {prop: "ToArray", name: "ToArray", pkg: "", typ: $funcType([], [sliceType], false)}, {prop: "Remove", name: "Remove", pkg: "", typ: $funcType([sliceType], [JQuery], true)}, {prop: "Stop", name: "Stop", pkg: "", typ: $funcType([sliceType], [JQuery], true)}, {prop: "AddBack", name: "AddBack", pkg: "", typ: $funcType([sliceType], [JQuery], true)}, {prop: "Css", name: "Css", pkg: "", typ: $funcType([$String], [$String], false)}, {prop: "CssArray", name: "CssArray", pkg: "", typ: $funcType([sliceType$1], [mapType], true)}, {prop: "SetCss", name: "SetCss", pkg: "", typ: $funcType([sliceType], [JQuery], true)}, {prop: "Text", name: "Text", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetText", name: "SetText", pkg: "", typ: $funcType([$emptyInterface], [JQuery], false)}, {prop: "Val", name: "Val", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetVal", name: "SetVal", pkg: "", typ: $funcType([$emptyInterface], [JQuery], false)}, {prop: "Prop", name: "Prop", pkg: "", typ: $funcType([$String], [$emptyInterface], false)}, {prop: "SetProp", name: "SetProp", pkg: "", typ: $funcType([sliceType], [JQuery], true)}, {prop: "RemoveProp", name: "RemoveProp", pkg: "", typ: $funcType([$String], [JQuery], false)}, {prop: "Attr", name: "Attr", pkg: "", typ: $funcType([$String], [$String], false)}, {prop: "SetAttr", name: "SetAttr", pkg: "", typ: $funcType([sliceType], [JQuery], true)}, {prop: "RemoveAttr", name: "RemoveAttr", pkg: "", typ: $funcType([$String], [JQuery], false)}, {prop: "HasClass", name: "HasClass", pkg: "", typ: $funcType([$String], [$Bool], false)}, {prop: "AddClass", name: "AddClass", pkg: "", typ: $funcType([$emptyInterface], [JQuery], false)}, {prop: "RemoveClass", name: "RemoveClass", pkg: "", typ: $funcType([$String], [JQuery], false)}, {prop: "ToggleClass", name: "ToggleClass", pkg: "", typ: $funcType([sliceType], [JQuery], true)}, {prop: "Focus", name: "Focus", pkg: "", typ: $funcType([], [JQuery], false)}, {prop: "Blur", name: "Blur", pkg: "", typ: $funcType([], [JQuery], false)}, {prop: "ReplaceAll", name: "ReplaceAll", pkg: "", typ: $funcType([$emptyInterface], [JQuery], false)}, {prop: "ReplaceWith", name: "ReplaceWith", pkg: "", typ: $funcType([$emptyInterface], [JQuery], false)}, {prop: "After", name: "After", pkg: "", typ: $funcType([sliceType], [JQuery], true)}, {prop: "Before", name: "Before", pkg: "", typ: $funcType([sliceType], [JQuery], true)}, {prop: "Prepend", name: "Prepend", pkg: "", typ: $funcType([sliceType], [JQuery], true)}, {prop: "PrependTo", name: "PrependTo", pkg: "", typ: $funcType([$emptyInterface], [JQuery], false)}, {prop: "AppendTo", name: "AppendTo", pkg: "", typ: $funcType([$emptyInterface], [JQuery], false)}, {prop: "InsertAfter", name: "InsertAfter", pkg: "", typ: $funcType([$emptyInterface], [JQuery], false)}, {prop: "InsertBefore", name: "InsertBefore", pkg: "", typ: $funcType([$emptyInterface], [JQuery], false)}, {prop: "Show", name: "Show", pkg: "", typ: $funcType([sliceType], [JQuery], true)}, {prop: "Hide", name: "Hide", pkg: "", typ: $funcType([sliceType], [JQuery], true)}, {prop: "Toggle", name: "Toggle", pkg: "", typ: $funcType([sliceType], [JQuery], true)}, {prop: "Contents", name: "Contents", pkg: "", typ: $funcType([], [JQuery], false)}, {prop: "Html", name: "Html", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetHtml", name: "SetHtml", pkg: "", typ: $funcType([$emptyInterface], [JQuery], false)}, {prop: "Closest", name: "Closest", pkg: "", typ: $funcType([sliceType], [JQuery], true)}, {prop: "End", name: "End", pkg: "", typ: $funcType([], [JQuery], false)}, {prop: "Add", name: "Add", pkg: "", typ: $funcType([sliceType], [JQuery], true)}, {prop: "Clone", name: "Clone", pkg: "", typ: $funcType([sliceType], [JQuery], true)}, {prop: "Height", name: "Height", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "SetHeight", name: "SetHeight", pkg: "", typ: $funcType([$String], [JQuery], false)}, {prop: "Width", name: "Width", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "SetWidth", name: "SetWidth", pkg: "", typ: $funcType([$emptyInterface], [JQuery], false)}, {prop: "InnerHeight", name: "InnerHeight", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "InnerWidth", name: "InnerWidth", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "Offset", name: "Offset", pkg: "", typ: $funcType([], [JQueryCoordinates], false)}, {prop: "SetOffset", name: "SetOffset", pkg: "", typ: $funcType([JQueryCoordinates], [JQuery], false)}, {prop: "OuterHeight", name: "OuterHeight", pkg: "", typ: $funcType([sliceType$2], [$Int], true)}, {prop: "OuterWidth", name: "OuterWidth", pkg: "", typ: $funcType([sliceType$2], [$Int], true)}, {prop: "Position", name: "Position", pkg: "", typ: $funcType([], [JQueryCoordinates], false)}, {prop: "ScrollLeft", name: "ScrollLeft", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "SetScrollLeft", name: "SetScrollLeft", pkg: "", typ: $funcType([$Int], [JQuery], false)}, {prop: "ScrollTop", name: "ScrollTop", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "SetScrollTop", name: "SetScrollTop", pkg: "", typ: $funcType([$Int], [JQuery], false)}, {prop: "ClearQueue", name: "ClearQueue", pkg: "", typ: $funcType([$String], [JQuery], false)}, {prop: "SetData", name: "SetData", pkg: "", typ: $funcType([$String, $emptyInterface], [JQuery], false)}, {prop: "Data", name: "Data", pkg: "", typ: $funcType([$String], [$emptyInterface], false)}, {prop: "Dequeue", name: "Dequeue", pkg: "", typ: $funcType([$String], [JQuery], false)}, {prop: "RemoveData", name: "RemoveData", pkg: "", typ: $funcType([$String], [JQuery], false)}, {prop: "OffsetParent", name: "OffsetParent", pkg: "", typ: $funcType([], [JQuery], false)}, {prop: "Parent", name: "Parent", pkg: "", typ: $funcType([sliceType], [JQuery], true)}, {prop: "Parents", name: "Parents", pkg: "", typ: $funcType([sliceType], [JQuery], true)}, {prop: "ParentsUntil", name: "ParentsUntil", pkg: "", typ: $funcType([sliceType], [JQuery], true)}, {prop: "Prev", name: "Prev", pkg: "", typ: $funcType([sliceType], [JQuery], true)}, {prop: "PrevAll", name: "PrevAll", pkg: "", typ: $funcType([sliceType], [JQuery], true)}, {prop: "PrevUntil", name: "PrevUntil", pkg: "", typ: $funcType([sliceType], [JQuery], true)}, {prop: "Siblings", name: "Siblings", pkg: "", typ: $funcType([sliceType], [JQuery], true)}, {prop: "Slice", name: "Slice", pkg: "", typ: $funcType([sliceType], [JQuery], true)}, {prop: "Children", name: "Children", pkg: "", typ: $funcType([$emptyInterface], [JQuery], false)}, {prop: "Unwrap", name: "Unwrap", pkg: "", typ: $funcType([], [JQuery], false)}, {prop: "Wrap", name: "Wrap", pkg: "", typ: $funcType([$emptyInterface], [JQuery], false)}, {prop: "WrapAll", name: "WrapAll", pkg: "", typ: $funcType([$emptyInterface], [JQuery], false)}, {prop: "WrapInner", name: "WrapInner", pkg: "", typ: $funcType([$emptyInterface], [JQuery], false)}, {prop: "Next", name: "Next", pkg: "", typ: $funcType([sliceType], [JQuery], true)}, {prop: "NextAll", name: "NextAll", pkg: "", typ: $funcType([sliceType], [JQuery], true)}, {prop: "NextUntil", name: "NextUntil", pkg: "", typ: $funcType([sliceType], [JQuery], true)}, {prop: "Not", name: "Not", pkg: "", typ: $funcType([sliceType], [JQuery], true)}, {prop: "Filter", name: "Filter", pkg: "", typ: $funcType([sliceType], [JQuery], true)}, {prop: "Find", name: "Find", pkg: "", typ: $funcType([sliceType], [JQuery], true)}, {prop: "First", name: "First", pkg: "", typ: $funcType([], [JQuery], false)}, {prop: "Has", name: "Has", pkg: "", typ: $funcType([$String], [JQuery], false)}, {prop: "Is", name: "Is", pkg: "", typ: $funcType([sliceType], [$Bool], true)}, {prop: "Last", name: "Last", pkg: "", typ: $funcType([], [JQuery], false)}, {prop: "Ready", name: "Ready", pkg: "", typ: $funcType([funcType$3], [JQuery], false)}, {prop: "Resize", name: "Resize", pkg: "", typ: $funcType([sliceType], [JQuery], true)}, {prop: "Scroll", name: "Scroll", pkg: "", typ: $funcType([sliceType], [JQuery], true)}, {prop: "FadeOut", name: "FadeOut", pkg: "", typ: $funcType([sliceType], [JQuery], true)}, {prop: "FadeToggle", name: "FadeToggle", pkg: "", typ: $funcType([sliceType], [JQuery], true)}, {prop: "SlideDown", name: "SlideDown", pkg: "", typ: $funcType([sliceType], [JQuery], true)}, {prop: "SlideToggle", name: "SlideToggle", pkg: "", typ: $funcType([sliceType], [JQuery], true)}, {prop: "SlideUp", name: "SlideUp", pkg: "", typ: $funcType([sliceType], [JQuery], true)}, {prop: "Select", name: "Select", pkg: "", typ: $funcType([sliceType], [JQuery], true)}, {prop: "Submit", name: "Submit", pkg: "", typ: $funcType([sliceType], [JQuery], true)}, {prop: "Trigger", name: "Trigger", pkg: "", typ: $funcType([sliceType], [JQuery], true)}, {prop: "On", name: "On", pkg: "", typ: $funcType([sliceType], [JQuery], true)}, {prop: "One", name: "One", pkg: "", typ: $funcType([sliceType], [JQuery], true)}, {prop: "Off", name: "Off", pkg: "", typ: $funcType([sliceType], [JQuery], true)}, {prop: "Load", name: "Load", pkg: "", typ: $funcType([sliceType], [JQuery], true)}, {prop: "Serialize", name: "Serialize", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SerializeArray", name: "SerializeArray", pkg: "", typ: $funcType([], [ptrType], false)}];
	ptrType$1.methods = [{prop: "PreventDefault", name: "PreventDefault", pkg: "", typ: $funcType([], [], false)}, {prop: "IsDefaultPrevented", name: "IsDefaultPrevented", pkg: "", typ: $funcType([], [$Bool], false)}, {prop: "IsImmediatePropogationStopped", name: "IsImmediatePropogationStopped", pkg: "", typ: $funcType([], [$Bool], false)}, {prop: "IsPropagationStopped", name: "IsPropagationStopped", pkg: "", typ: $funcType([], [$Bool], false)}, {prop: "StopImmediatePropagation", name: "StopImmediatePropagation", pkg: "", typ: $funcType([], [], false)}, {prop: "StopPropagation", name: "StopPropagation", pkg: "", typ: $funcType([], [], false)}];
	JQuery.init("antisocial/vendor/github.com/gopherjs/jquery", [{prop: "o", name: "o", exported: false, typ: ptrType, tag: ""}, {prop: "Jquery", name: "Jquery", exported: true, typ: $String, tag: "js:\"jquery\""}, {prop: "Selector", name: "Selector", exported: true, typ: $String, tag: "js:\"selector\""}, {prop: "Length", name: "Length", exported: true, typ: $Int, tag: "js:\"length\""}, {prop: "Context", name: "Context", exported: true, typ: $String, tag: "js:\"context\""}]);
	Event.init("", [{prop: "Object", name: "", exported: true, typ: ptrType, tag: ""}, {prop: "KeyCode", name: "KeyCode", exported: true, typ: $Int, tag: "js:\"keyCode\""}, {prop: "Target", name: "Target", exported: true, typ: ptrType, tag: "js:\"target\""}, {prop: "CurrentTarget", name: "CurrentTarget", exported: true, typ: ptrType, tag: "js:\"currentTarget\""}, {prop: "DelegateTarget", name: "DelegateTarget", exported: true, typ: ptrType, tag: "js:\"delegateTarget\""}, {prop: "RelatedTarget", name: "RelatedTarget", exported: true, typ: ptrType, tag: "js:\"relatedTarget\""}, {prop: "Data", name: "Data", exported: true, typ: ptrType, tag: "js:\"data\""}, {prop: "Result", name: "Result", exported: true, typ: ptrType, tag: "js:\"result\""}, {prop: "Which", name: "Which", exported: true, typ: $Int, tag: "js:\"which\""}, {prop: "Namespace", name: "Namespace", exported: true, typ: $String, tag: "js:\"namespace\""}, {prop: "MetaKey", name: "MetaKey", exported: true, typ: $Bool, tag: "js:\"metaKey\""}, {prop: "PageX", name: "PageX", exported: true, typ: $Int, tag: "js:\"pageX\""}, {prop: "PageY", name: "PageY", exported: true, typ: $Int, tag: "js:\"pageY\""}, {prop: "Type", name: "Type", exported: true, typ: $String, tag: "js:\"type\""}]);
	JQueryCoordinates.init("", [{prop: "Left", name: "Left", exported: true, typ: $Int, tag: ""}, {prop: "Top", name: "Top", exported: true, typ: $Int, tag: ""}]);
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		$r = js.$init(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["main"] = (function() {
	var $pkg = {}, $init, jquery, sliceType, funcType, jQuery, main;
	jquery = $packages["antisocial/vendor/github.com/gopherjs/jquery"];
	sliceType = $sliceType($emptyInterface);
	funcType = $funcType([jquery.Event], [], false);
	main = function() {
		var $ptr, _r, _r$1, _r$2, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		_r = jQuery(new sliceType([])); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		console.log("Your current jQuery version is: " + $internalize(_r.o.jquery, $String));
		_r$1 = jQuery(new sliceType([new $String("input#name")])); /* */ $s = 2; case 2: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
		_r$2 = _r$1.On(new sliceType([new $String("keyup"), new funcType((function $b(e) {
			var $ptr, _r$2, _r$3, _r$4, _r$5, _r$6, _r$7, e, name, $s, $r;
			/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r$2 = $f._r$2; _r$3 = $f._r$3; _r$4 = $f._r$4; _r$5 = $f._r$5; _r$6 = $f._r$6; _r$7 = $f._r$7; e = $f.e; name = $f.name; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
			e = $clone(e, jquery.Event);
			_r$2 = jQuery(new sliceType([new $jsObjectPtr(e.Object.target)])); /* */ $s = 1; case 1: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
			_r$3 = _r$2.Val(); /* */ $s = 2; case 2: if($c) { $c = false; _r$3 = _r$3.$blk(); } if (_r$3 && _r$3.$blk !== undefined) { break s; }
			name = _r$3;
			name = jquery.Trim(name);
			/* */ if (name.length > 0) { $s = 3; continue; }
			/* */ $s = 4; continue;
			/* if (name.length > 0) { */ case 3:
				_r$4 = jQuery(new sliceType([new $String("span#output")])); /* */ $s = 6; case 6: if($c) { $c = false; _r$4 = _r$4.$blk(); } if (_r$4 && _r$4.$blk !== undefined) { break s; }
				_r$5 = _r$4.SetText(new $String("Welcome to GopherJS, " + name + " !")); /* */ $s = 7; case 7: if($c) { $c = false; _r$5 = _r$5.$blk(); } if (_r$5 && _r$5.$blk !== undefined) { break s; }
				_r$5;
				$s = 5; continue;
			/* } else { */ case 4:
				_r$6 = jQuery(new sliceType([new $String("span#output")])); /* */ $s = 8; case 8: if($c) { $c = false; _r$6 = _r$6.$blk(); } if (_r$6 && _r$6.$blk !== undefined) { break s; }
				_r$7 = _r$6.Empty(); /* */ $s = 9; case 9: if($c) { $c = false; _r$7 = _r$7.$blk(); } if (_r$7 && _r$7.$blk !== undefined) { break s; }
				_r$7;
			/* } */ case 5:
			$s = -1; return;
			return;
			/* */ } return; } if ($f === undefined) { $f = { $blk: $b }; } $f.$ptr = $ptr; $f._r$2 = _r$2; $f._r$3 = _r$3; $f._r$4 = _r$4; $f._r$5 = _r$5; $f._r$6 = _r$6; $f._r$7 = _r$7; $f.e = e; $f.name = name; $f.$s = $s; $f.$r = $r; return $f;
		}))])); /* */ $s = 3; case 3: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
		_r$2;
		$s = -1; return;
		return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: main }; } $f.$ptr = $ptr; $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f.$s = $s; $f.$r = $r; return $f;
	};
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		$r = jquery.$init(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		jQuery = jquery.NewJQuery;
		/* */ if ($pkg === $mainPkg) { $s = 2; continue; }
		/* */ $s = 3; continue;
		/* if ($pkg === $mainPkg) { */ case 2:
			$r = main(); /* */ $s = 4; case 4: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
			$mainFinished = true;
		/* } */ case 3:
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$synthesizeMethods();
var $mainPkg = $packages["main"];
$packages["runtime"].$init();
$go($mainPkg.$init, [], true);
$flushConsole();

}).call(this);
//# sourceMappingURL=main.js.map
