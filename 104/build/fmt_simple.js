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
var $min = Math.min;
var $mod = function(x, y) { return x % y; };
var $parseInt = parseInt;
var $parseFloat = function(f) {
  if (f !== undefined && f !== null && f.constructor === Number) {
    return f;
  }
  return parseFloat(f);
};
var $flushConsole = function() {};
var $throwRuntimeError; /* set by package "runtime" */
var $throwNilPointerError = function() { $throwRuntimeError("invalid memory address or nil pointer dereference"); };

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

var $methodExpr = function(method) {
  if (method.$expr === undefined) {
    method.$expr = function() {
      $stackDepthOffset--;
      try {
        return Function.call.apply(method, arguments);
      } finally {
        $stackDepthOffset++;
      }
    };
  }
  return method.$expr;
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
    str += String.fromCharCode.apply(null, slice.$array.subarray(slice.$offset + i, slice.$offset + Math.min(slice.$length, i + 10000)));
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
  $internalCopy(dst.$array, src.$array, dst.$offset, src.$offset, n, dst.constructor.elem);
  return n;
};

var $copy = function(dst, src, typ) {
  switch (typ.kind) {
  case $kindArray:
    $internalCopy(dst, src, 0, 0, src.length, typ.elem);
    break;
  case $kindStruct:
    for (var i = 0; i < typ.fields.length; i++) {
      var f = typ.fields[i];
      switch (f.typ.kind) {
      case $kindArray:
      case $kindStruct:
        $copy(dst[f.prop], src[f.prop], f.typ);
        continue;
      default:
        dst[f.prop] = src[f.prop];
        continue;
      }
    }
    break;
  }
};

var $internalCopy = function(dst, src, dstOffset, srcOffset, n, elem) {
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
        $copy(dst[dstOffset + i], src[srcOffset + i], elem);
      }
      return;
    }
    for (var i = 0; i < n; i++) {
      $copy(dst[dstOffset + i], src[srcOffset + i], elem);
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
  $copy(clone, src, type);
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
          set: function(value) { obj[fieldProp] = value; },
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

  $internalCopy(newArray, array, newOffset + slice.$length, offset, length, slice.constructor.elem);

  var newSlice = new slice.constructor(newArray);
  newSlice.$offset = newOffset;
  newSlice.$length = newLength;
  newSlice.$capacity = newCapacity;
  return newSlice;
};

var $equal = function(a, b, type) {
  if (type === $js.Object) {
    return a === b;
  }
  switch (type.kind) {
  case $kindFloat32:
    return $float32IsEqual(a, b);
  case $kindComplex64:
    return $float32IsEqual(a.$real, b.$real) && $float32IsEqual(a.$imag, b.$imag);
  case $kindComplex128:
    return a.$real === b.$real && a.$imag === b.$imag;
  case $kindInt64:
  case $kindUint64:
    return a.$high === b.$high && a.$low === b.$low;
  case $kindPtr:
    if (a.constructor.elem) {
      return a === b;
    }
    return $pointerIsEqual(a, b);
  case $kindArray:
    if (a.length != b.length) {
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
  if (!a.constructor.comparable) {
    $throwRuntimeError("comparing uncomparable type " + a.constructor.string);
  }
  return $equal(a.$val, b.$val, a.constructor);
};

var $float32IsEqual = function(a, b) {
  if (a === b) {
    return true;
  }
  if (a === 1/0 || b === 1/0 || a === -1/0 || b === -1/0 || a !== a || b !== b) {
    return false;
  }
  var math = $packages["math"];
  return math !== undefined && math.Float32bits(a) === math.Float32bits(b);
};

var $pointerIsEqual = function(a, b) {
  if (a === b) {
    return true;
  }
  if (a.$get === $throwNilPointerError || b.$get === $throwNilPointerError) {
    return a.$get === $throwNilPointerError && b.$get === $throwNilPointerError;
  }
  var va = a.$get();
  var vb = b.$get();
  if (va !== vb) {
    return false;
  }
  var dummy = va + 1;
  a.$set(dummy);
  var equal = b.$get() === dummy;
  a.$set(va);
  return equal;
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

var $newType = function(size, kind, string, name, pkg, constructor) {
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
  case $kindString:
  case $kindUnsafePointer:
    typ = function(v) { this.$val = v; };
    typ.prototype.$key = function() { return string + "$" + this.$val; };
    break;

  case $kindFloat32:
  case $kindFloat64:
    typ = function(v) { this.$val = v; };
    typ.prototype.$key = function() { return string + "$" + $floatKey(this.$val); };
    break;

  case $kindInt64:
    typ = function(high, low) {
      this.$high = (high + Math.floor(Math.ceil(low) / 4294967296)) >> 0;
      this.$low = low >>> 0;
      this.$val = this;
    };
    typ.prototype.$key = function() { return string + "$" + this.$high + "$" + this.$low; };
    break;

  case $kindUint64:
    typ = function(high, low) {
      this.$high = (high + Math.floor(Math.ceil(low) / 4294967296)) >>> 0;
      this.$low = low >>> 0;
      this.$val = this;
    };
    typ.prototype.$key = function() { return string + "$" + this.$high + "$" + this.$low; };
    break;

  case $kindComplex64:
  case $kindComplex128:
    typ = function(real, imag) {
      this.$real = real;
      this.$imag = imag;
      this.$val = this;
    };
    typ.prototype.$key = function() { return string + "$" + this.$real + "$" + this.$imag; };
    break;

  case $kindArray:
    typ = function(v) { this.$val = v; };
    typ.ptr = $newType(4, $kindPtr, "*" + string, "", "", function(array) {
      this.$get = function() { return array; };
      this.$set = function(v) { $copy(this, v, typ); };
      this.$val = array;
    });
    typ.init = function(elem, len) {
      typ.elem = elem;
      typ.len = len;
      typ.comparable = elem.comparable;
      typ.prototype.$key = function() {
        return string + "$" + Array.prototype.join.call($mapArray(this.$val, function(e) {
          var key = e.$key ? e.$key() : String(e);
          return key.replace(/\\/g, "\\\\").replace(/\$/g, "\\$");
        }), "$");
      };
      typ.ptr.init(typ);
      Object.defineProperty(typ.ptr.nil, "nilCheck", { get: $throwNilPointerError });
    };
    break;

  case $kindChan:
    typ = function(capacity) {
      this.$val = this;
      this.$capacity = capacity;
      this.$buffer = [];
      this.$sendQueue = [];
      this.$recvQueue = [];
      this.$closed = false;
    };
    typ.prototype.$key = function() {
      if (this.$id === undefined) {
        $idCounter++;
        this.$id = $idCounter;
      }
      return String(this.$id);
    };
    typ.init = function(elem, sendOnly, recvOnly) {
      typ.elem = elem;
      typ.sendOnly = sendOnly;
      typ.recvOnly = recvOnly;
      typ.nil = new typ(0);
      typ.nil.$sendQueue = typ.nil.$recvQueue = { length: 0, push: function() {}, shift: function() { return undefined; }, indexOf: function() { return -1; } };
    };
    break;

  case $kindFunc:
    typ = function(v) { this.$val = v; };
    typ.init = function(params, results, variadic) {
      typ.params = params;
      typ.results = results;
      typ.variadic = variadic;
      typ.comparable = false;
    };
    break;

  case $kindInterface:
    typ = { implementedBy: {}, missingMethodFor: {} };
    typ.init = function(methods) {
      typ.methods = methods;
      methods.forEach(function(m) {
        $ifaceNil[m.prop] = $throwNilPointerError;
      });
    };
    break;

  case $kindMap:
    typ = function(v) { this.$val = v; };
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
    typ.prototype.$key = function() {
      if (this.$id === undefined) {
        $idCounter++;
        this.$id = $idCounter;
      }
      return String(this.$id);
    };
    typ.init = function(elem) {
      typ.elem = elem;
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
    typ.ptr = $newType(4, $kindPtr, "*" + string, "", "", constructor);
    typ.ptr.elem = typ;
    typ.ptr.prototype.$get = function() { return this; };
    typ.ptr.prototype.$set = function(v) { $copy(this, v, typ); };
    typ.init = function(fields) {
      typ.fields = fields;
      fields.forEach(function(f) {
        if (!f.typ.comparable) {
          typ.comparable = false;
        }
      });
      typ.prototype.$key = function() {
        var val = this.$val;
        return string + "$" + $mapArray(fields, function(f) {
          var e = val[f.prop];
          var key = e.$key ? e.$key() : String(e);
          return key.replace(/\\/g, "\\\\").replace(/\$/g, "\\$");
        }).join("$");
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
            if (f.typ === $js.Object) {
              v = new $js.container.ptr(v);
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

  case $kindChan:
  case $kindPtr:
  case $kindSlice:
    typ.zero = function() { return typ.nil; };
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

  typ.size = size;
  typ.kind = kind;
  typ.string = string;
  typ.typeName = name;
  typ.pkg = pkg;
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

      if(e.typ.typeName !== "") {
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

var $Bool          = $newType( 1, $kindBool,          "bool",           "bool",       "", null);
var $Int           = $newType( 4, $kindInt,           "int",            "int",        "", null);
var $Int8          = $newType( 1, $kindInt8,          "int8",           "int8",       "", null);
var $Int16         = $newType( 2, $kindInt16,         "int16",          "int16",      "", null);
var $Int32         = $newType( 4, $kindInt32,         "int32",          "int32",      "", null);
var $Int64         = $newType( 8, $kindInt64,         "int64",          "int64",      "", null);
var $Uint          = $newType( 4, $kindUint,          "uint",           "uint",       "", null);
var $Uint8         = $newType( 1, $kindUint8,         "uint8",          "uint8",      "", null);
var $Uint16        = $newType( 2, $kindUint16,        "uint16",         "uint16",     "", null);
var $Uint32        = $newType( 4, $kindUint32,        "uint32",         "uint32",     "", null);
var $Uint64        = $newType( 8, $kindUint64,        "uint64",         "uint64",     "", null);
var $Uintptr       = $newType( 4, $kindUintptr,       "uintptr",        "uintptr",    "", null);
var $Float32       = $newType( 4, $kindFloat32,       "float32",        "float32",    "", null);
var $Float64       = $newType( 8, $kindFloat64,       "float64",        "float64",    "", null);
var $Complex64     = $newType( 8, $kindComplex64,     "complex64",      "complex64",  "", null);
var $Complex128    = $newType(16, $kindComplex128,    "complex128",     "complex128", "", null);
var $String        = $newType( 8, $kindString,        "string",         "string",     "", null);
var $UnsafePointer = $newType( 4, $kindUnsafePointer, "unsafe.Pointer", "Pointer",    "", null);

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
  var string = "[" + len + "]" + elem.string;
  var typ = $arrayTypes[string];
  if (typ === undefined) {
    typ = $newType(12, $kindArray, string, "", "", null);
    $arrayTypes[string] = typ;
    typ.init(elem, len);
  }
  return typ;
};

var $chanType = function(elem, sendOnly, recvOnly) {
  var string = (recvOnly ? "<-" : "") + "chan" + (sendOnly ? "<- " : " ") + elem.string;
  var field = sendOnly ? "SendChan" : (recvOnly ? "RecvChan" : "Chan");
  var typ = elem[field];
  if (typ === undefined) {
    typ = $newType(4, $kindChan, string, "", "", null);
    elem[field] = typ;
    typ.init(elem, sendOnly, recvOnly);
  }
  return typ;
};

var $funcTypes = {};
var $funcType = function(params, results, variadic) {
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
  var typ = $funcTypes[string];
  if (typ === undefined) {
    typ = $newType(4, $kindFunc, string, "", "", null);
    $funcTypes[string] = typ;
    typ.init(params, results, variadic);
  }
  return typ;
};

var $interfaceTypes = {};
var $interfaceType = function(methods) {
  var string = "interface {}";
  if (methods.length !== 0) {
    string = "interface { " + $mapArray(methods, function(m) {
      return (m.pkg !== "" ? m.pkg + "." : "") + m.name + m.typ.string.substr(4);
    }).join("; ") + " }";
  }
  var typ = $interfaceTypes[string];
  if (typ === undefined) {
    typ = $newType(8, $kindInterface, string, "", "", null);
    $interfaceTypes[string] = typ;
    typ.init(methods);
  }
  return typ;
};
var $emptyInterface = $interfaceType([]);
var $ifaceNil = { $key: function() { return "nil"; } };
var $error = $newType(8, $kindInterface, "error", "error", "", null);
$error.init([{prop: "Error", name: "Error", pkg: "", typ: $funcType([], [$String], false)}]);

var $Map = function() {};
(function() {
  var names = Object.getOwnPropertyNames(Object.prototype);
  for (var i = 0; i < names.length; i++) {
    $Map.prototype[names[i]] = undefined;
  }
})();
var $mapTypes = {};
var $mapType = function(key, elem) {
  var string = "map[" + key.string + "]" + elem.string;
  var typ = $mapTypes[string];
  if (typ === undefined) {
    typ = $newType(4, $kindMap, string, "", "", null);
    $mapTypes[string] = typ;
    typ.init(key, elem);
  }
  return typ;
};

var $ptrType = function(elem) {
  var typ = elem.ptr;
  if (typ === undefined) {
    typ = $newType(4, $kindPtr, "*" + elem.string, "", "", null);
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

var $sliceType = function(elem) {
  var typ = elem.Slice;
  if (typ === undefined) {
    typ = $newType(12, $kindSlice, "[]" + elem.string, "", "", null);
    elem.Slice = typ;
    typ.init(elem);
  }
  return typ;
};
var $makeSlice = function(typ, length, capacity) {
  capacity = capacity || length;
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
var $structType = function(fields) {
  var string = "struct { " + $mapArray(fields, function(f) {
    return f.name + " " + f.typ.string + (f.tag !== "" ? (" \"" + f.tag.replace(/\\/g, "\\\\").replace(/"/g, "\\\"") + "\"") : "");
  }).join("; ") + " }";
  if (fields.length === 0) {
    string = "struct {}";
  }
  var typ = $structTypes[string];
  if (typ === undefined) {
    typ = $newType(0, $kindStruct, string, "", "", function() {
      this.$val = this;
      for (var i = 0; i < fields.length; i++) {
        var f = fields[i];
        var arg = arguments[i];
        this[f.prop] = arg !== undefined ? arg : f.typ.zero();
      }
    });
    $structTypes[string] = typ;
    typ.init(fields);
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
  if (type === $js.Object) {
    value = value.Object;
  }
  return returnTuple ? [value, true] : value;
};

var $coerceFloat32 = function(f) {
  var math = $packages["math"];
  if (math === undefined) {
    return f;
  }
  return math.Float32frombits(math.Float32bits(f));
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
  var ninf = n.$real === 1/0 || n.$real === -1/0 || n.$imag === 1/0 || n.$imag === -1/0;
  var dinf = d.$real === 1/0 || d.$real === -1/0 || d.$imag === 1/0 || d.$imag === -1/0;
  var nnan = !ninf && (n.$real !== n.$real || n.$imag !== n.$imag);
  var dnan = !dinf && (d.$real !== d.$real || d.$imag !== d.$imag);
  if(nnan || dnan) {
    return new n.constructor(0/0, 0/0);
  }
  if (ninf && !dinf) {
    return new n.constructor(1/0, 1/0);
  }
  if (!ninf && dinf) {
    return new n.constructor(0, 0);
  }
  if (d.$real === 0 && d.$imag === 0) {
    if (n.$real === 0 && n.$imag === 0) {
      return new n.constructor(0/0, 0/0);
    }
    return new n.constructor(1/0, 1/0);
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

var $stackDepthOffset = 0;
var $getStackDepth = function() {
  var err = new Error();
  if (err.stack === undefined) {
    return undefined;
  }
  return $stackDepthOffset + err.stack.split("\n").length;
};

var $deferFrames = [], $skippedDeferFrames = 0, $jumpToDefer = false, $panicStackDepth = null, $panicValue;
var $callDeferred = function(deferred, jsErr) {
  if ($skippedDeferFrames !== 0) {
    $skippedDeferFrames--;
    throw jsErr;
  }
  if ($jumpToDefer) {
    $jumpToDefer = false;
    throw jsErr;
  }
  if (jsErr) {
    var newErr = null;
    try {
      $deferFrames.push(deferred);
      $panic(new $js.Error.ptr(jsErr));
    } catch (err) {
      newErr = err;
    }
    $deferFrames.pop();
    $callDeferred(deferred, newErr);
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

  var call, localSkippedDeferFrames = 0;
  try {
    while (true) {
      if (deferred === null) {
        deferred = $deferFrames[$deferFrames.length - 1 - localSkippedDeferFrames];
        if (deferred === undefined) {
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
        if (localPanicValue !== undefined) {
          localSkippedDeferFrames++;
          deferred = null;
          continue;
        }
        return;
      }
      var r = call[0].apply(undefined, call[1]);
      if (r && r.$blocking) {
        deferred.push([r, []]);
      }

      if (localPanicValue !== undefined && $panicStackDepth === null) {
        throw null; /* error was recovered */
      }
    }
  } finally {
    $skippedDeferFrames += localSkippedDeferFrames;
    if ($curGoroutine.asleep) {
      deferred.push(call);
      $jumpToDefer = true;
    }
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
  $callDeferred(null, null);
};
var $recover = function() {
  if ($panicStackDepth === null || ($panicStackDepth !== undefined && $panicStackDepth !== $getStackDepth() - 2)) {
    return $ifaceNil;
  }
  $panicStackDepth = null;
  return $panicValue;
};
var $throw = function(err) { throw err; };

var $BLOCKING = new Object();
var $nonblockingCall = function() {
  $panic(new $packages["runtime"].NotSupportedError.ptr("non-blocking call to blocking function, see https://github.com/gopherjs/gopherjs#goroutines"));
};

var $dummyGoroutine = { asleep: false, exit: false, panicStack: [] };
var $curGoroutine = $dummyGoroutine, $totalGoroutines = 0, $awakeGoroutines = 0, $checkForDeadlock = true;
var $go = function(fun, args, direct) {
  $totalGoroutines++;
  $awakeGoroutines++;
  args.push($BLOCKING);
  var goroutine = function() {
    var rescheduled = false;
    try {
      $curGoroutine = goroutine;
      $skippedDeferFrames = 0;
      $jumpToDefer = false;
      var r = fun.apply(undefined, args);
      if (r && r.$blocking) {
        fun = r;
        args = [];
        $schedule(goroutine, direct);
        rescheduled = true;
        return;
      }
      goroutine.exit = true;
    } catch (err) {
      if (!$curGoroutine.asleep) {
        goroutine.exit = true;
        throw err;
      }
    } finally {
      $curGoroutine = $dummyGoroutine;
      if (goroutine.exit && !rescheduled) { /* also set by runtime.Goexit() */
        $totalGoroutines--;
        goroutine.asleep = true;
      }
      if (goroutine.asleep && !rescheduled) {
        $awakeGoroutines--;
        if ($awakeGoroutines === 0 && $totalGoroutines !== 0 && $checkForDeadlock) {
          console.error("fatal error: all goroutines are asleep - deadlock!");
        }
      }
    }
  };
  goroutine.asleep = false;
  goroutine.exit = false;
  goroutine.panicStack = [];
  $schedule(goroutine, direct);
};

var $scheduled = [], $schedulerLoopActive = false;
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
  if (!$schedulerLoopActive) {
    $schedulerLoopActive = true;
    setTimeout(function() {
      while (true) {
        var r = $scheduled.shift();
        if (r === undefined) {
          $schedulerLoopActive = false;
          break;
        }
        r();
      };
    }, 0);
  }
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
  chan.$sendQueue.push(function() {
    $schedule(thisGoroutine);
    return value;
  });
  var blocked = false;
  var f = function() {
    if (blocked) {
      if (chan.$closed) {
        $throwRuntimeError("send on closed channel");
      }
      return;
    };
    blocked = true;
    $curGoroutine.asleep = true;
    throw null;
  };
  f.$blocking = true;
  return f;
};
var $recv = function(chan) {
  var queuedSend = chan.$sendQueue.shift();
  if (queuedSend !== undefined) {
    chan.$buffer.push(queuedSend());
  }
  var bufferedValue = chan.$buffer.shift();
  if (bufferedValue !== undefined) {
    return [bufferedValue, true];
  }
  if (chan.$closed) {
    return [chan.constructor.elem.zero(), false];
  }

  var thisGoroutine = $curGoroutine, value;
  var queueEntry = function(v) {
    value = v;
    $schedule(thisGoroutine);
  };
  chan.$recvQueue.push(queueEntry);
  var blocked = false;
  var f = function() {
    if (blocked) {
      return value;
    };
    blocked = true;
    $curGoroutine.asleep = true;
    throw null;
  };
  f.$blocking = true;
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
    queuedSend(); /* will panic because of closed channel */
  }
  while (true) {
    var queuedRecv = chan.$recvQueue.shift();
    if (queuedRecv === undefined) {
      break;
    }
    queuedRecv([chan.constructor.elem.zero(), false]);
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
          selection = [i, value];
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
          selection = [i];
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
  var blocked = false;
  var f = function() {
    if (blocked) {
      return selection;
    };
    blocked = true;
    $curGoroutine.asleep = true;
    throw null;
  };
  f.$blocking = true;
  return f;
};

var $js;

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
    case $kindInterface:
      return t !== $js.Object;
    default:
      return true;
  }
};

var $externalize = function(v, t) {
  if ($js !== undefined && t === $js.Object) {
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
    if (v === $throwNilPointerError) {
      return null;
    }
    if (v.$externalizeWrapper === undefined) {
      $checkForDeadlock = false;
      var convert = false;
      for (var i = 0; i < t.params.length; i++) {
        convert = convert || (t.params[i] !== $js.Object);
      }
      for (var i = 0; i < t.results.length; i++) {
        convert = convert || $needsExternalization(t.results[i]);
      }
      v.$externalizeWrapper = v;
      if (convert) {
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
          var result = v.apply(this, args);
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
    }
    return v.$externalizeWrapper;
  case $kindInterface:
    if (v === $ifaceNil) {
      return null;
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
      s += String.fromCharCode(r[0]);
    }
    return s;
  case $kindStruct:
    var timePkg = $packages["time"];
    if (timePkg && v.constructor === timePkg.Time.ptr) {
      var milli = $div64(v.UnixNano(), new $Int64(0, 1000000));
      return new Date($flatten64(milli));
    }

    var searchJsObject = function(v, t) {
      if (t === $js.Object) {
        return v;
      }
      if (t.kind === $kindPtr && v !== t.nil) {
        var o = searchJsObject(v.$get(), t.elem);
        if (o !== undefined) {
          return o;
        }
      }
      if (t.kind === $kindStruct) {
        for (var i = 0; i < t.fields.length; i++) {
          var f = t.fields[i];
          var o = searchJsObject(v[f.prop], f.typ);
          if (o !== undefined) {
            return o;
          }
        }
      }
      return undefined;
    };
    var o = searchJsObject(v, t);
    if (o !== undefined) {
      return o;
    }

    o = {};
    for (var i = 0; i < t.fields.length; i++) {
      var f = t.fields[i];
      if (f.pkg !== "") { /* not exported */
        continue;
      }
      o[f.name] = $externalize(v[f.prop], f.typ);
    }
    return o;
  }
  $panic(new $String("cannot externalize " + t.string));
};

var $internalize = function(v, t, recv) {
  if (t === $js.Object) {
    return v;
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
      $panic(new $String("cannot internalize " + t.string));
    }
    if (v === null) {
      return $ifaceNil;
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
      var timePkg = $packages["time"];
      if (timePkg) {
        return new timePkg.Time(timePkg.Unix(new $Int64(0, 0), new $Int64(0, v.getTime() * 1000000)));
      }
    case Function:
      var funcType = $funcType([$sliceType($emptyInterface)], [$js.Object], true);
      return new funcType($internalize(v, funcType));
    case Number:
      return new $Float64(parseFloat(v));
    case String:
      return new $String($internalize(v, $String));
    default:
      if ($global.Node && v instanceof $global.Node) {
        return new $js.container.ptr(v);
      }
      var mapType = $mapType($String, $emptyInterface);
      return new mapType($internalize(v, mapType));
    }
  case $kindMap:
    var m = new $Map();
    var keys = $keys(v);
    for (var i = 0; i < keys.length; i++) {
      var key = $internalize(keys[i], t.key);
      m[key.$key ? key.$key() : key] = { k: key, v: $internalize(v[keys[i]], t.elem) };
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
    for (var i = 0; i < v.length; i++) {
      s += $encodeRune(v.charCodeAt(i));
    }
    return s;
  case $kindStruct:
    var searchJsObject = function(v, t) {
      if (t === $js.Object) {
        return v;
      }
      if (t.kind === $kindPtr && t.elem.kind === $kindStruct) {
        var o = searchJsObject(v, t.elem);
        if (o !== undefined) {
          return o;
        }
      }
      if (t.kind === $kindStruct) {
        for (var i = 0; i < t.fields.length; i++) {
          var f = t.fields[i];
          var o = searchJsObject(v, f.typ);
          if (o !== undefined) {
            var n = new t.ptr();
            n[f.prop] = o;
            return n;
          }
        }
      }
      return undefined;
    };
    var o = searchJsObject(v, t);
    if (o !== undefined) {
      return o;
    }
  }
  $panic(new $String("cannot internalize " + t.string));
};

$packages["github.com/gopherjs/gopherjs/js"] = (function() {
	var $pkg = {}, Object, container, Error, sliceType$1, ptrType, ptrType$1, init;
	Object = $pkg.Object = $newType(8, $kindInterface, "js.Object", "Object", "github.com/gopherjs/gopherjs/js", null);
	container = $pkg.container = $newType(0, $kindStruct, "js.container", "container", "github.com/gopherjs/gopherjs/js", function(Object_) {
		this.$val = this;
		this.Object = Object_ !== undefined ? Object_ : null;
	});
	Error = $pkg.Error = $newType(0, $kindStruct, "js.Error", "Error", "github.com/gopherjs/gopherjs/js", function(Object_) {
		this.$val = this;
		this.Object = Object_ !== undefined ? Object_ : null;
	});
	sliceType$1 = $sliceType($emptyInterface);
	ptrType = $ptrType(container);
	ptrType$1 = $ptrType(Error);
	container.ptr.prototype.Get = function(key) {
		var c, key;
		c = this;
		return c.Object[$externalize(key, $String)];
	};
	container.prototype.Get = function(key) { return this.$val.Get(key); };
	container.ptr.prototype.Set = function(key, value) {
		var c, key, value;
		c = this;
		c.Object[$externalize(key, $String)] = $externalize(value, $emptyInterface);
	};
	container.prototype.Set = function(key, value) { return this.$val.Set(key, value); };
	container.ptr.prototype.Delete = function(key) {
		var c, key;
		c = this;
		delete c.Object[$externalize(key, $String)];
	};
	container.prototype.Delete = function(key) { return this.$val.Delete(key); };
	container.ptr.prototype.Length = function() {
		var c;
		c = this;
		return $parseInt(c.Object.length);
	};
	container.prototype.Length = function() { return this.$val.Length(); };
	container.ptr.prototype.Index = function(i) {
		var c, i;
		c = this;
		return c.Object[i];
	};
	container.prototype.Index = function(i) { return this.$val.Index(i); };
	container.ptr.prototype.SetIndex = function(i, value) {
		var c, i, value;
		c = this;
		c.Object[i] = $externalize(value, $emptyInterface);
	};
	container.prototype.SetIndex = function(i, value) { return this.$val.SetIndex(i, value); };
	container.ptr.prototype.Call = function(name, args) {
		var args, c, name, obj;
		c = this;
		return (obj = c.Object, obj[$externalize(name, $String)].apply(obj, $externalize(args, sliceType$1)));
	};
	container.prototype.Call = function(name, args) { return this.$val.Call(name, args); };
	container.ptr.prototype.Invoke = function(args) {
		var args, c;
		c = this;
		return c.Object.apply(undefined, $externalize(args, sliceType$1));
	};
	container.prototype.Invoke = function(args) { return this.$val.Invoke(args); };
	container.ptr.prototype.New = function(args) {
		var args, c;
		c = this;
		return new ($global.Function.prototype.bind.apply(c.Object, [undefined].concat($externalize(args, sliceType$1))));
	};
	container.prototype.New = function(args) { return this.$val.New(args); };
	container.ptr.prototype.Bool = function() {
		var c;
		c = this;
		return !!(c.Object);
	};
	container.prototype.Bool = function() { return this.$val.Bool(); };
	container.ptr.prototype.String = function() {
		var c;
		c = this;
		return $internalize(c.Object, $String);
	};
	container.prototype.String = function() { return this.$val.String(); };
	container.ptr.prototype.Int = function() {
		var c;
		c = this;
		return $parseInt(c.Object) >> 0;
	};
	container.prototype.Int = function() { return this.$val.Int(); };
	container.ptr.prototype.Int64 = function() {
		var c;
		c = this;
		return $internalize(c.Object, $Int64);
	};
	container.prototype.Int64 = function() { return this.$val.Int64(); };
	container.ptr.prototype.Uint64 = function() {
		var c;
		c = this;
		return $internalize(c.Object, $Uint64);
	};
	container.prototype.Uint64 = function() { return this.$val.Uint64(); };
	container.ptr.prototype.Float = function() {
		var c;
		c = this;
		return $parseFloat(c.Object);
	};
	container.prototype.Float = function() { return this.$val.Float(); };
	container.ptr.prototype.Interface = function() {
		var c;
		c = this;
		return $internalize(c.Object, $emptyInterface);
	};
	container.prototype.Interface = function() { return this.$val.Interface(); };
	container.ptr.prototype.Unsafe = function() {
		var c;
		c = this;
		return c.Object;
	};
	container.prototype.Unsafe = function() { return this.$val.Unsafe(); };
	Error.ptr.prototype.Error = function() {
		var err;
		err = this;
		return "JavaScript error: " + $internalize(err.Object.message, $String);
	};
	Error.prototype.Error = function() { return this.$val.Error(); };
	Error.ptr.prototype.Stack = function() {
		var err;
		err = this;
		return $internalize(err.Object.stack, $String);
	};
	Error.prototype.Stack = function() { return this.$val.Stack(); };
	init = function() {
		var _tmp, _tmp$1, c, e;
		c = new container.ptr(null);
		e = new Error.ptr(null);
		
	};
	ptrType.methods = [{prop: "Get", name: "Get", pkg: "", typ: $funcType([$String], [Object], false)}, {prop: "Set", name: "Set", pkg: "", typ: $funcType([$String, $emptyInterface], [], false)}, {prop: "Delete", name: "Delete", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Length", name: "Length", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "Index", name: "Index", pkg: "", typ: $funcType([$Int], [Object], false)}, {prop: "SetIndex", name: "SetIndex", pkg: "", typ: $funcType([$Int, $emptyInterface], [], false)}, {prop: "Call", name: "Call", pkg: "", typ: $funcType([$String, sliceType$1], [Object], true)}, {prop: "Invoke", name: "Invoke", pkg: "", typ: $funcType([sliceType$1], [Object], true)}, {prop: "New", name: "New", pkg: "", typ: $funcType([sliceType$1], [Object], true)}, {prop: "Bool", name: "Bool", pkg: "", typ: $funcType([], [$Bool], false)}, {prop: "String", name: "String", pkg: "", typ: $funcType([], [$String], false)}, {prop: "Int", name: "Int", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "Int64", name: "Int64", pkg: "", typ: $funcType([], [$Int64], false)}, {prop: "Uint64", name: "Uint64", pkg: "", typ: $funcType([], [$Uint64], false)}, {prop: "Float", name: "Float", pkg: "", typ: $funcType([], [$Float64], false)}, {prop: "Interface", name: "Interface", pkg: "", typ: $funcType([], [$emptyInterface], false)}, {prop: "Unsafe", name: "Unsafe", pkg: "", typ: $funcType([], [$Uintptr], false)}];
	ptrType$1.methods = [{prop: "Error", name: "Error", pkg: "", typ: $funcType([], [$String], false)}, {prop: "Stack", name: "Stack", pkg: "", typ: $funcType([], [$String], false)}];
	Object.init([{prop: "Bool", name: "Bool", pkg: "", typ: $funcType([], [$Bool], false)}, {prop: "Call", name: "Call", pkg: "", typ: $funcType([$String, sliceType$1], [Object], true)}, {prop: "Delete", name: "Delete", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Float", name: "Float", pkg: "", typ: $funcType([], [$Float64], false)}, {prop: "Get", name: "Get", pkg: "", typ: $funcType([$String], [Object], false)}, {prop: "Index", name: "Index", pkg: "", typ: $funcType([$Int], [Object], false)}, {prop: "Int", name: "Int", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "Int64", name: "Int64", pkg: "", typ: $funcType([], [$Int64], false)}, {prop: "Interface", name: "Interface", pkg: "", typ: $funcType([], [$emptyInterface], false)}, {prop: "Invoke", name: "Invoke", pkg: "", typ: $funcType([sliceType$1], [Object], true)}, {prop: "Length", name: "Length", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "New", name: "New", pkg: "", typ: $funcType([sliceType$1], [Object], true)}, {prop: "Set", name: "Set", pkg: "", typ: $funcType([$String, $emptyInterface], [], false)}, {prop: "SetIndex", name: "SetIndex", pkg: "", typ: $funcType([$Int, $emptyInterface], [], false)}, {prop: "String", name: "String", pkg: "", typ: $funcType([], [$String], false)}, {prop: "Uint64", name: "Uint64", pkg: "", typ: $funcType([], [$Uint64], false)}, {prop: "Unsafe", name: "Unsafe", pkg: "", typ: $funcType([], [$Uintptr], false)}]);
	container.init([{prop: "Object", name: "", pkg: "", typ: Object, tag: ""}]);
	Error.init([{prop: "Object", name: "", pkg: "", typ: Object, tag: ""}]);
	$pkg.$init = function() {
		$pkg.$init = function() {};
		/* */ var $r, $s = 0; var $init_js = function() { while (true) { switch ($s) { case 0:
		init();
		/* */ } return; } }; $init_js.$blocking = true; return $init_js;
	};
	return $pkg;
})();
$packages["runtime"] = (function() {
	var $pkg = {}, js, NotSupportedError, TypeAssertionError, errorString, ptrType$5, ptrType$6, init, GOROOT, SetFinalizer;
	js = $packages["github.com/gopherjs/gopherjs/js"];
	NotSupportedError = $pkg.NotSupportedError = $newType(0, $kindStruct, "runtime.NotSupportedError", "NotSupportedError", "runtime", function(Feature_) {
		this.$val = this;
		this.Feature = Feature_ !== undefined ? Feature_ : "";
	});
	TypeAssertionError = $pkg.TypeAssertionError = $newType(0, $kindStruct, "runtime.TypeAssertionError", "TypeAssertionError", "runtime", function(interfaceString_, concreteString_, assertedString_, missingMethod_) {
		this.$val = this;
		this.interfaceString = interfaceString_ !== undefined ? interfaceString_ : "";
		this.concreteString = concreteString_ !== undefined ? concreteString_ : "";
		this.assertedString = assertedString_ !== undefined ? assertedString_ : "";
		this.missingMethod = missingMethod_ !== undefined ? missingMethod_ : "";
	});
	errorString = $pkg.errorString = $newType(8, $kindString, "runtime.errorString", "errorString", "runtime", null);
	ptrType$5 = $ptrType(NotSupportedError);
	ptrType$6 = $ptrType(TypeAssertionError);
	NotSupportedError.ptr.prototype.Error = function() {
		var err;
		err = this;
		return "not supported by GopherJS: " + err.Feature;
	};
	NotSupportedError.prototype.Error = function() { return this.$val.Error(); };
	init = function() {
		var e;
		$js = $packages[$externalize("github.com/gopherjs/gopherjs/js", $String)];
		$throwRuntimeError = (function(msg) {
			var msg;
			$panic(new errorString(msg));
		});
		e = $ifaceNil;
		e = new TypeAssertionError.ptr("", "", "", "");
		e = new NotSupportedError.ptr("");
	};
	GOROOT = $pkg.GOROOT = function() {
		var goroot, process;
		process = $global.process;
		if (process === undefined) {
			return "/";
		}
		goroot = process.env.GOROOT;
		if (!(goroot === undefined)) {
			return $internalize(goroot, $String);
		}
		return "/usr/local/go";
	};
	SetFinalizer = $pkg.SetFinalizer = function(x, f) {
		var f, x;
	};
	TypeAssertionError.ptr.prototype.RuntimeError = function() {
	};
	TypeAssertionError.prototype.RuntimeError = function() { return this.$val.RuntimeError(); };
	TypeAssertionError.ptr.prototype.Error = function() {
		var e, inter;
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
		var e;
		e = this.$val;
	};
	$ptrType(errorString).prototype.RuntimeError = function() { return new errorString(this.$get()).RuntimeError(); };
	errorString.prototype.Error = function() {
		var e;
		e = this.$val;
		return "runtime error: " + e;
	};
	$ptrType(errorString).prototype.Error = function() { return new errorString(this.$get()).Error(); };
	ptrType$5.methods = [{prop: "Error", name: "Error", pkg: "", typ: $funcType([], [$String], false)}];
	ptrType$6.methods = [{prop: "RuntimeError", name: "RuntimeError", pkg: "", typ: $funcType([], [], false)}, {prop: "Error", name: "Error", pkg: "", typ: $funcType([], [$String], false)}];
	errorString.methods = [{prop: "RuntimeError", name: "RuntimeError", pkg: "", typ: $funcType([], [], false)}, {prop: "Error", name: "Error", pkg: "", typ: $funcType([], [$String], false)}];
	NotSupportedError.init([{prop: "Feature", name: "Feature", pkg: "", typ: $String, tag: ""}]);
	TypeAssertionError.init([{prop: "interfaceString", name: "interfaceString", pkg: "runtime", typ: $String, tag: ""}, {prop: "concreteString", name: "concreteString", pkg: "runtime", typ: $String, tag: ""}, {prop: "assertedString", name: "assertedString", pkg: "runtime", typ: $String, tag: ""}, {prop: "missingMethod", name: "missingMethod", pkg: "runtime", typ: $String, tag: ""}]);
	$pkg.$init = function() {
		$pkg.$init = function() {};
		/* */ var $r, $s = 0; var $init_runtime = function() { while (true) { switch ($s) { case 0:
		$r = js.$init($BLOCKING); /* */ $s = 1; case 1: if ($r && $r.$blocking) { $r = $r(); }
		init();
		/* */ } return; } }; $init_runtime.$blocking = true; return $init_runtime;
	};
	return $pkg;
})();
$packages["errors"] = (function() {
	var $pkg = {}, errorString, ptrType, New;
	errorString = $pkg.errorString = $newType(0, $kindStruct, "errors.errorString", "errorString", "errors", function(s_) {
		this.$val = this;
		this.s = s_ !== undefined ? s_ : "";
	});
	ptrType = $ptrType(errorString);
	New = $pkg.New = function(text) {
		var text;
		return new errorString.ptr(text);
	};
	errorString.ptr.prototype.Error = function() {
		var e;
		e = this;
		return e.s;
	};
	errorString.prototype.Error = function() { return this.$val.Error(); };
	ptrType.methods = [{prop: "Error", name: "Error", pkg: "", typ: $funcType([], [$String], false)}];
	errorString.init([{prop: "s", name: "s", pkg: "errors", typ: $String, tag: ""}]);
	$pkg.$init = function() {
		$pkg.$init = function() {};
		/* */ var $r, $s = 0; var $init_errors = function() { while (true) { switch ($s) { case 0:
		/* */ } return; } }; $init_errors.$blocking = true; return $init_errors;
	};
	return $pkg;
})();
$packages["sync/atomic"] = (function() {
	var $pkg = {}, js, CompareAndSwapInt32, AddInt32, LoadUint32, StoreInt32, StoreUint32;
	js = $packages["github.com/gopherjs/gopherjs/js"];
	CompareAndSwapInt32 = $pkg.CompareAndSwapInt32 = function(addr, old, new$1) {
		var addr, new$1, old;
		if (addr.$get() === old) {
			addr.$set(new$1);
			return true;
		}
		return false;
	};
	AddInt32 = $pkg.AddInt32 = function(addr, delta) {
		var addr, delta, new$1;
		new$1 = addr.$get() + delta >> 0;
		addr.$set(new$1);
		return new$1;
	};
	LoadUint32 = $pkg.LoadUint32 = function(addr) {
		var addr;
		return addr.$get();
	};
	StoreInt32 = $pkg.StoreInt32 = function(addr, val) {
		var addr, val;
		addr.$set(val);
	};
	StoreUint32 = $pkg.StoreUint32 = function(addr, val) {
		var addr, val;
		addr.$set(val);
	};
	$pkg.$init = function() {
		$pkg.$init = function() {};
		/* */ var $r, $s = 0; var $init_atomic = function() { while (true) { switch ($s) { case 0:
		$r = js.$init($BLOCKING); /* */ $s = 1; case 1: if ($r && $r.$blocking) { $r = $r(); }
		/* */ } return; } }; $init_atomic.$blocking = true; return $init_atomic;
	};
	return $pkg;
})();
$packages["sync"] = (function() {
	var $pkg = {}, runtime, atomic, Pool, Mutex, Locker, Once, poolLocal, syncSema, RWMutex, rlocker, ptrType, sliceType, structType, chanType, sliceType$1, ptrType$2, ptrType$3, ptrType$5, sliceType$3, ptrType$7, ptrType$8, funcType, ptrType$10, funcType$1, ptrType$11, arrayType, semWaiters, allPools, runtime_registerPoolCleanup, runtime_Semacquire, runtime_Semrelease, runtime_Syncsemcheck, poolCleanup, init, indexLocal, raceEnable, init$1;
	runtime = $packages["runtime"];
	atomic = $packages["sync/atomic"];
	Pool = $pkg.Pool = $newType(0, $kindStruct, "sync.Pool", "Pool", "sync", function(local_, localSize_, store_, New_) {
		this.$val = this;
		this.local = local_ !== undefined ? local_ : 0;
		this.localSize = localSize_ !== undefined ? localSize_ : 0;
		this.store = store_ !== undefined ? store_ : sliceType$3.nil;
		this.New = New_ !== undefined ? New_ : $throwNilPointerError;
	});
	Mutex = $pkg.Mutex = $newType(0, $kindStruct, "sync.Mutex", "Mutex", "sync", function(state_, sema_) {
		this.$val = this;
		this.state = state_ !== undefined ? state_ : 0;
		this.sema = sema_ !== undefined ? sema_ : 0;
	});
	Locker = $pkg.Locker = $newType(8, $kindInterface, "sync.Locker", "Locker", "sync", null);
	Once = $pkg.Once = $newType(0, $kindStruct, "sync.Once", "Once", "sync", function(m_, done_) {
		this.$val = this;
		this.m = m_ !== undefined ? m_ : new Mutex.ptr();
		this.done = done_ !== undefined ? done_ : 0;
	});
	poolLocal = $pkg.poolLocal = $newType(0, $kindStruct, "sync.poolLocal", "poolLocal", "sync", function(private$0_, shared_, Mutex_, pad_) {
		this.$val = this;
		this.private$0 = private$0_ !== undefined ? private$0_ : $ifaceNil;
		this.shared = shared_ !== undefined ? shared_ : sliceType$3.nil;
		this.Mutex = Mutex_ !== undefined ? Mutex_ : new Mutex.ptr();
		this.pad = pad_ !== undefined ? pad_ : arrayType.zero();
	});
	syncSema = $pkg.syncSema = $newType(0, $kindStruct, "sync.syncSema", "syncSema", "sync", function(lock_, head_, tail_) {
		this.$val = this;
		this.lock = lock_ !== undefined ? lock_ : 0;
		this.head = head_ !== undefined ? head_ : 0;
		this.tail = tail_ !== undefined ? tail_ : 0;
	});
	RWMutex = $pkg.RWMutex = $newType(0, $kindStruct, "sync.RWMutex", "RWMutex", "sync", function(w_, writerSem_, readerSem_, readerCount_, readerWait_) {
		this.$val = this;
		this.w = w_ !== undefined ? w_ : new Mutex.ptr();
		this.writerSem = writerSem_ !== undefined ? writerSem_ : 0;
		this.readerSem = readerSem_ !== undefined ? readerSem_ : 0;
		this.readerCount = readerCount_ !== undefined ? readerCount_ : 0;
		this.readerWait = readerWait_ !== undefined ? readerWait_ : 0;
	});
	rlocker = $pkg.rlocker = $newType(0, $kindStruct, "sync.rlocker", "rlocker", "sync", function(w_, writerSem_, readerSem_, readerCount_, readerWait_) {
		this.$val = this;
		this.w = w_ !== undefined ? w_ : new Mutex.ptr();
		this.writerSem = writerSem_ !== undefined ? writerSem_ : 0;
		this.readerSem = readerSem_ !== undefined ? readerSem_ : 0;
		this.readerCount = readerCount_ !== undefined ? readerCount_ : 0;
		this.readerWait = readerWait_ !== undefined ? readerWait_ : 0;
	});
	ptrType = $ptrType(Pool);
	sliceType = $sliceType(ptrType);
	structType = $structType([]);
	chanType = $chanType(structType, false, false);
	sliceType$1 = $sliceType(chanType);
	ptrType$2 = $ptrType($Uint32);
	ptrType$3 = $ptrType($Int32);
	ptrType$5 = $ptrType(poolLocal);
	sliceType$3 = $sliceType($emptyInterface);
	ptrType$7 = $ptrType(rlocker);
	ptrType$8 = $ptrType(RWMutex);
	funcType = $funcType([], [$emptyInterface], false);
	ptrType$10 = $ptrType(Mutex);
	funcType$1 = $funcType([], [], false);
	ptrType$11 = $ptrType(Once);
	arrayType = $arrayType($Uint8, 128);
	Pool.ptr.prototype.Get = function() {
		var p, x, x$1, x$2;
		p = this;
		if (p.store.$length === 0) {
			if (!(p.New === $throwNilPointerError)) {
				return p.New();
			}
			return $ifaceNil;
		}
		x$2 = (x = p.store, x$1 = p.store.$length - 1 >> 0, ((x$1 < 0 || x$1 >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + x$1]));
		p.store = $subslice(p.store, 0, (p.store.$length - 1 >> 0));
		return x$2;
	};
	Pool.prototype.Get = function() { return this.$val.Get(); };
	Pool.ptr.prototype.Put = function(x) {
		var p, x;
		p = this;
		if ($interfaceIsEqual(x, $ifaceNil)) {
			return;
		}
		p.store = $append(p.store, x);
	};
	Pool.prototype.Put = function(x) { return this.$val.Put(x); };
	runtime_registerPoolCleanup = function(cleanup) {
		var cleanup;
	};
	runtime_Semacquire = function(s, $b) {
		var $args = arguments, $r, $s = 0, $this = this, _entry, _key, _r, ch;
		/* */ if($b !== $BLOCKING) { $nonblockingCall(); }; var $blocking_runtime_Semacquire = function() { s: while (true) { switch ($s) { case 0:
		/* if (s.$get() === 0) { */ if (s.$get() === 0) {} else { $s = 1; continue; }
			ch = new chanType(0);
			_key = s; (semWaiters || $throwRuntimeError("assignment to entry in nil map"))[_key.$key()] = { k: _key, v: $append((_entry = semWaiters[s.$key()], _entry !== undefined ? _entry.v : sliceType$1.nil), ch) };
			_r = $recv(ch, $BLOCKING); /* */ $s = 2; case 2: if (_r && _r.$blocking) { _r = _r(); }
			_r[0];
		/* } */ case 1:
		s.$set(s.$get() - (1) >>> 0);
		/* */ case -1: } return; } }; $blocking_runtime_Semacquire.$blocking = true; return $blocking_runtime_Semacquire;
	};
	runtime_Semrelease = function(s, $b) {
		var $args = arguments, $r, $s = 0, $this = this, _entry, _key, ch, w;
		/* */ if($b !== $BLOCKING) { $nonblockingCall(); }; var $blocking_runtime_Semrelease = function() { s: while (true) { switch ($s) { case 0:
		s.$set(s.$get() + (1) >>> 0);
		w = (_entry = semWaiters[s.$key()], _entry !== undefined ? _entry.v : sliceType$1.nil);
		if (w.$length === 0) {
			return;
		}
		ch = ((0 < 0 || 0 >= w.$length) ? $throwRuntimeError("index out of range") : w.$array[w.$offset + 0]);
		w = $subslice(w, 1);
		_key = s; (semWaiters || $throwRuntimeError("assignment to entry in nil map"))[_key.$key()] = { k: _key, v: w };
		if (w.$length === 0) {
			delete semWaiters[s.$key()];
		}
		$r = $send(ch, new structType.ptr(), $BLOCKING); /* */ $s = 1; case 1: if ($r && $r.$blocking) { $r = $r(); }
		/* */ case -1: } return; } }; $blocking_runtime_Semrelease.$blocking = true; return $blocking_runtime_Semrelease;
	};
	runtime_Syncsemcheck = function(size) {
		var size;
	};
	Mutex.ptr.prototype.Lock = function($b) {
		var $args = arguments, $r, $s = 0, $this = this, awoke, m, new$1, old;
		/* */ if($b !== $BLOCKING) { $nonblockingCall(); }; var $blocking_Lock = function() { s: while (true) { switch ($s) { case 0:
		m = $this;
		if (atomic.CompareAndSwapInt32(new ptrType$3(function() { return this.$target.state; }, function($v) { this.$target.state = $v; }, m), 0, 1)) {
			return;
		}
		awoke = false;
		/* while (true) { */ case 1:
			/* if (!(true)) { break; } */ if(!(true)) { $s = 2; continue; }
			old = m.state;
			new$1 = old | 1;
			if (!(((old & 1) === 0))) {
				new$1 = old + 4 >> 0;
			}
			if (awoke) {
				new$1 = new$1 & ~(2);
			}
			/* if (atomic.CompareAndSwapInt32(new ptrType$3(function() { return this.$target.state; }, function($v) { this.$target.state = $v; }, m), old, new$1)) { */ if (atomic.CompareAndSwapInt32(new ptrType$3(function() { return this.$target.state; }, function($v) { this.$target.state = $v; }, m), old, new$1)) {} else { $s = 3; continue; }
				if ((old & 1) === 0) {
					/* break; */ $s = 2; continue;
				}
				$r = runtime_Semacquire(new ptrType$2(function() { return this.$target.sema; }, function($v) { this.$target.sema = $v; }, m), $BLOCKING); /* */ $s = 4; case 4: if ($r && $r.$blocking) { $r = $r(); }
				awoke = true;
			/* } */ case 3:
		/* } */ $s = 1; continue; case 2:
		/* */ case -1: } return; } }; $blocking_Lock.$blocking = true; return $blocking_Lock;
	};
	Mutex.prototype.Lock = function($b) { return this.$val.Lock($b); };
	Mutex.ptr.prototype.Unlock = function($b) {
		var $args = arguments, $r, $s = 0, $this = this, m, new$1, old;
		/* */ if($b !== $BLOCKING) { $nonblockingCall(); }; var $blocking_Unlock = function() { s: while (true) { switch ($s) { case 0:
		m = $this;
		new$1 = atomic.AddInt32(new ptrType$3(function() { return this.$target.state; }, function($v) { this.$target.state = $v; }, m), -1);
		if ((((new$1 + 1 >> 0)) & 1) === 0) {
			$panic(new $String("sync: unlock of unlocked mutex"));
		}
		old = new$1;
		/* while (true) { */ case 1:
			/* if (!(true)) { break; } */ if(!(true)) { $s = 2; continue; }
			if (((old >> 2 >> 0) === 0) || !(((old & 3) === 0))) {
				return;
			}
			new$1 = ((old - 4 >> 0)) | 2;
			/* if (atomic.CompareAndSwapInt32(new ptrType$3(function() { return this.$target.state; }, function($v) { this.$target.state = $v; }, m), old, new$1)) { */ if (atomic.CompareAndSwapInt32(new ptrType$3(function() { return this.$target.state; }, function($v) { this.$target.state = $v; }, m), old, new$1)) {} else { $s = 3; continue; }
				$r = runtime_Semrelease(new ptrType$2(function() { return this.$target.sema; }, function($v) { this.$target.sema = $v; }, m), $BLOCKING); /* */ $s = 4; case 4: if ($r && $r.$blocking) { $r = $r(); }
				return;
			/* } */ case 3:
			old = m.state;
		/* } */ $s = 1; continue; case 2:
		/* */ case -1: } return; } }; $blocking_Unlock.$blocking = true; return $blocking_Unlock;
	};
	Mutex.prototype.Unlock = function($b) { return this.$val.Unlock($b); };
	Once.ptr.prototype.Do = function(f, $b) {
		var $args = arguments, $deferred = [], $err = null, $r, $s = 0, $this = this, o;
		/* */ if($b !== $BLOCKING) { $nonblockingCall(); }; var $blocking_Do = function() { try { $deferFrames.push($deferred); s: while (true) { switch ($s) { case 0:
		o = $this;
		if (atomic.LoadUint32(new ptrType$2(function() { return this.$target.done; }, function($v) { this.$target.done = $v; }, o)) === 1) {
			return;
		}
		$r = o.m.Lock($BLOCKING); /* */ $s = 1; case 1: if ($r && $r.$blocking) { $r = $r(); }
		$deferred.push([$methodVal(o.m, "Unlock"), [$BLOCKING]]);
		if (o.done === 0) {
			$deferred.push([atomic.StoreUint32, [new ptrType$2(function() { return this.$target.done; }, function($v) { this.$target.done = $v; }, o), 1, $BLOCKING]]);
			f();
		}
		/* */ case -1: } return; } } catch(err) { $err = err; } finally { $deferFrames.pop(); if ($curGoroutine.asleep && !$jumpToDefer) { throw null; } $s = -1; $callDeferred($deferred, $err); } }; $blocking_Do.$blocking = true; return $blocking_Do;
	};
	Once.prototype.Do = function(f, $b) { return this.$val.Do(f, $b); };
	poolCleanup = function() {
		var _i, _i$1, _ref, _ref$1, i, i$1, j, l, p, x;
		_ref = allPools;
		_i = 0;
		while (true) {
			if (!(_i < _ref.$length)) { break; }
			i = _i;
			p = ((_i < 0 || _i >= _ref.$length) ? $throwRuntimeError("index out of range") : _ref.$array[_ref.$offset + _i]);
			(i < 0 || i >= allPools.$length) ? $throwRuntimeError("index out of range") : allPools.$array[allPools.$offset + i] = ptrType.nil;
			i$1 = 0;
			while (true) {
				if (!(i$1 < (p.localSize >> 0))) { break; }
				l = indexLocal(p.local, i$1);
				l.private$0 = $ifaceNil;
				_ref$1 = l.shared;
				_i$1 = 0;
				while (true) {
					if (!(_i$1 < _ref$1.$length)) { break; }
					j = _i$1;
					(x = l.shared, (j < 0 || j >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + j] = $ifaceNil);
					_i$1++;
				}
				l.shared = sliceType$3.nil;
				i$1 = i$1 + (1) >> 0;
			}
			p.local = 0;
			p.localSize = 0;
			_i++;
		}
		allPools = new sliceType([]);
	};
	init = function() {
		runtime_registerPoolCleanup(poolCleanup);
	};
	indexLocal = function(l, i) {
		var i, l, x;
		return (x = l, (x.nilCheck, ((i < 0 || i >= x.length) ? $throwRuntimeError("index out of range") : x[i])));
	};
	raceEnable = function() {
	};
	init$1 = function() {
		var s;
		s = $clone(new syncSema.ptr(), syncSema);
		runtime_Syncsemcheck(12);
	};
	RWMutex.ptr.prototype.RLock = function($b) {
		var $args = arguments, $r, $s = 0, $this = this, rw;
		/* */ if($b !== $BLOCKING) { $nonblockingCall(); }; var $blocking_RLock = function() { s: while (true) { switch ($s) { case 0:
		rw = $this;
		/* if (atomic.AddInt32(new ptrType$3(function() { return this.$target.readerCount; }, function($v) { this.$target.readerCount = $v; }, rw), 1) < 0) { */ if (atomic.AddInt32(new ptrType$3(function() { return this.$target.readerCount; }, function($v) { this.$target.readerCount = $v; }, rw), 1) < 0) {} else { $s = 1; continue; }
			$r = runtime_Semacquire(new ptrType$2(function() { return this.$target.readerSem; }, function($v) { this.$target.readerSem = $v; }, rw), $BLOCKING); /* */ $s = 2; case 2: if ($r && $r.$blocking) { $r = $r(); }
		/* } */ case 1:
		/* */ case -1: } return; } }; $blocking_RLock.$blocking = true; return $blocking_RLock;
	};
	RWMutex.prototype.RLock = function($b) { return this.$val.RLock($b); };
	RWMutex.ptr.prototype.RUnlock = function($b) {
		var $args = arguments, $r, $s = 0, $this = this, r, rw;
		/* */ if($b !== $BLOCKING) { $nonblockingCall(); }; var $blocking_RUnlock = function() { s: while (true) { switch ($s) { case 0:
		rw = $this;
		r = atomic.AddInt32(new ptrType$3(function() { return this.$target.readerCount; }, function($v) { this.$target.readerCount = $v; }, rw), -1);
		/* if (r < 0) { */ if (r < 0) {} else { $s = 1; continue; }
			if (((r + 1 >> 0) === 0) || ((r + 1 >> 0) === -1073741824)) {
				raceEnable();
				$panic(new $String("sync: RUnlock of unlocked RWMutex"));
			}
			/* if (atomic.AddInt32(new ptrType$3(function() { return this.$target.readerWait; }, function($v) { this.$target.readerWait = $v; }, rw), -1) === 0) { */ if (atomic.AddInt32(new ptrType$3(function() { return this.$target.readerWait; }, function($v) { this.$target.readerWait = $v; }, rw), -1) === 0) {} else { $s = 2; continue; }
				$r = runtime_Semrelease(new ptrType$2(function() { return this.$target.writerSem; }, function($v) { this.$target.writerSem = $v; }, rw), $BLOCKING); /* */ $s = 3; case 3: if ($r && $r.$blocking) { $r = $r(); }
			/* } */ case 2:
		/* } */ case 1:
		/* */ case -1: } return; } }; $blocking_RUnlock.$blocking = true; return $blocking_RUnlock;
	};
	RWMutex.prototype.RUnlock = function($b) { return this.$val.RUnlock($b); };
	RWMutex.ptr.prototype.Lock = function($b) {
		var $args = arguments, $r, $s = 0, $this = this, r, rw;
		/* */ if($b !== $BLOCKING) { $nonblockingCall(); }; var $blocking_Lock = function() { s: while (true) { switch ($s) { case 0:
		rw = $this;
		$r = rw.w.Lock($BLOCKING); /* */ $s = 1; case 1: if ($r && $r.$blocking) { $r = $r(); }
		r = atomic.AddInt32(new ptrType$3(function() { return this.$target.readerCount; }, function($v) { this.$target.readerCount = $v; }, rw), -1073741824) + 1073741824 >> 0;
		/* if (!((r === 0)) && !((atomic.AddInt32(new ptrType$3(function() { return this.$target.readerWait; }, function($v) { this.$target.readerWait = $v; }, rw), r) === 0))) { */ if (!((r === 0)) && !((atomic.AddInt32(new ptrType$3(function() { return this.$target.readerWait; }, function($v) { this.$target.readerWait = $v; }, rw), r) === 0))) {} else { $s = 2; continue; }
			$r = runtime_Semacquire(new ptrType$2(function() { return this.$target.writerSem; }, function($v) { this.$target.writerSem = $v; }, rw), $BLOCKING); /* */ $s = 3; case 3: if ($r && $r.$blocking) { $r = $r(); }
		/* } */ case 2:
		/* */ case -1: } return; } }; $blocking_Lock.$blocking = true; return $blocking_Lock;
	};
	RWMutex.prototype.Lock = function($b) { return this.$val.Lock($b); };
	RWMutex.ptr.prototype.Unlock = function($b) {
		var $args = arguments, $r, $s = 0, $this = this, i, r, rw;
		/* */ if($b !== $BLOCKING) { $nonblockingCall(); }; var $blocking_Unlock = function() { s: while (true) { switch ($s) { case 0:
		rw = $this;
		r = atomic.AddInt32(new ptrType$3(function() { return this.$target.readerCount; }, function($v) { this.$target.readerCount = $v; }, rw), 1073741824);
		if (r >= 1073741824) {
			raceEnable();
			$panic(new $String("sync: Unlock of unlocked RWMutex"));
		}
		i = 0;
		/* while (true) { */ case 1:
			/* if (!(i < (r >> 0))) { break; } */ if(!(i < (r >> 0))) { $s = 2; continue; }
			$r = runtime_Semrelease(new ptrType$2(function() { return this.$target.readerSem; }, function($v) { this.$target.readerSem = $v; }, rw), $BLOCKING); /* */ $s = 3; case 3: if ($r && $r.$blocking) { $r = $r(); }
			i = i + (1) >> 0;
		/* } */ $s = 1; continue; case 2:
		$r = rw.w.Unlock($BLOCKING); /* */ $s = 4; case 4: if ($r && $r.$blocking) { $r = $r(); }
		/* */ case -1: } return; } }; $blocking_Unlock.$blocking = true; return $blocking_Unlock;
	};
	RWMutex.prototype.Unlock = function($b) { return this.$val.Unlock($b); };
	RWMutex.ptr.prototype.RLocker = function() {
		var rw;
		rw = this;
		return $pointerOfStructConversion(rw, ptrType$7);
	};
	RWMutex.prototype.RLocker = function() { return this.$val.RLocker(); };
	rlocker.ptr.prototype.Lock = function($b) {
		var $args = arguments, $r, $s = 0, $this = this, r;
		/* */ if($b !== $BLOCKING) { $nonblockingCall(); }; var $blocking_Lock = function() { s: while (true) { switch ($s) { case 0:
		r = $this;
		$r = $pointerOfStructConversion(r, ptrType$8).RLock($BLOCKING); /* */ $s = 1; case 1: if ($r && $r.$blocking) { $r = $r(); }
		/* */ case -1: } return; } }; $blocking_Lock.$blocking = true; return $blocking_Lock;
	};
	rlocker.prototype.Lock = function($b) { return this.$val.Lock($b); };
	rlocker.ptr.prototype.Unlock = function($b) {
		var $args = arguments, $r, $s = 0, $this = this, r;
		/* */ if($b !== $BLOCKING) { $nonblockingCall(); }; var $blocking_Unlock = function() { s: while (true) { switch ($s) { case 0:
		r = $this;
		$r = $pointerOfStructConversion(r, ptrType$8).RUnlock($BLOCKING); /* */ $s = 1; case 1: if ($r && $r.$blocking) { $r = $r(); }
		/* */ case -1: } return; } }; $blocking_Unlock.$blocking = true; return $blocking_Unlock;
	};
	rlocker.prototype.Unlock = function($b) { return this.$val.Unlock($b); };
	ptrType.methods = [{prop: "Get", name: "Get", pkg: "", typ: $funcType([], [$emptyInterface], false)}, {prop: "Put", name: "Put", pkg: "", typ: $funcType([$emptyInterface], [], false)}, {prop: "getSlow", name: "getSlow", pkg: "sync", typ: $funcType([], [$emptyInterface], false)}, {prop: "pin", name: "pin", pkg: "sync", typ: $funcType([], [ptrType$5], false)}, {prop: "pinSlow", name: "pinSlow", pkg: "sync", typ: $funcType([], [ptrType$5], false)}];
	ptrType$10.methods = [{prop: "Lock", name: "Lock", pkg: "", typ: $funcType([], [], false)}, {prop: "Unlock", name: "Unlock", pkg: "", typ: $funcType([], [], false)}];
	ptrType$11.methods = [{prop: "Do", name: "Do", pkg: "", typ: $funcType([funcType$1], [], false)}];
	ptrType$8.methods = [{prop: "RLock", name: "RLock", pkg: "", typ: $funcType([], [], false)}, {prop: "RUnlock", name: "RUnlock", pkg: "", typ: $funcType([], [], false)}, {prop: "Lock", name: "Lock", pkg: "", typ: $funcType([], [], false)}, {prop: "Unlock", name: "Unlock", pkg: "", typ: $funcType([], [], false)}, {prop: "RLocker", name: "RLocker", pkg: "", typ: $funcType([], [Locker], false)}];
	ptrType$7.methods = [{prop: "Lock", name: "Lock", pkg: "", typ: $funcType([], [], false)}, {prop: "Unlock", name: "Unlock", pkg: "", typ: $funcType([], [], false)}];
	Pool.init([{prop: "local", name: "local", pkg: "sync", typ: $UnsafePointer, tag: ""}, {prop: "localSize", name: "localSize", pkg: "sync", typ: $Uintptr, tag: ""}, {prop: "store", name: "store", pkg: "sync", typ: sliceType$3, tag: ""}, {prop: "New", name: "New", pkg: "", typ: funcType, tag: ""}]);
	Mutex.init([{prop: "state", name: "state", pkg: "sync", typ: $Int32, tag: ""}, {prop: "sema", name: "sema", pkg: "sync", typ: $Uint32, tag: ""}]);
	Locker.init([{prop: "Lock", name: "Lock", pkg: "", typ: $funcType([], [], false)}, {prop: "Unlock", name: "Unlock", pkg: "", typ: $funcType([], [], false)}]);
	Once.init([{prop: "m", name: "m", pkg: "sync", typ: Mutex, tag: ""}, {prop: "done", name: "done", pkg: "sync", typ: $Uint32, tag: ""}]);
	poolLocal.init([{prop: "private$0", name: "private", pkg: "sync", typ: $emptyInterface, tag: ""}, {prop: "shared", name: "shared", pkg: "sync", typ: sliceType$3, tag: ""}, {prop: "Mutex", name: "", pkg: "", typ: Mutex, tag: ""}, {prop: "pad", name: "pad", pkg: "sync", typ: arrayType, tag: ""}]);
	syncSema.init([{prop: "lock", name: "lock", pkg: "sync", typ: $Uintptr, tag: ""}, {prop: "head", name: "head", pkg: "sync", typ: $UnsafePointer, tag: ""}, {prop: "tail", name: "tail", pkg: "sync", typ: $UnsafePointer, tag: ""}]);
	RWMutex.init([{prop: "w", name: "w", pkg: "sync", typ: Mutex, tag: ""}, {prop: "writerSem", name: "writerSem", pkg: "sync", typ: $Uint32, tag: ""}, {prop: "readerSem", name: "readerSem", pkg: "sync", typ: $Uint32, tag: ""}, {prop: "readerCount", name: "readerCount", pkg: "sync", typ: $Int32, tag: ""}, {prop: "readerWait", name: "readerWait", pkg: "sync", typ: $Int32, tag: ""}]);
	rlocker.init([{prop: "w", name: "w", pkg: "sync", typ: Mutex, tag: ""}, {prop: "writerSem", name: "writerSem", pkg: "sync", typ: $Uint32, tag: ""}, {prop: "readerSem", name: "readerSem", pkg: "sync", typ: $Uint32, tag: ""}, {prop: "readerCount", name: "readerCount", pkg: "sync", typ: $Int32, tag: ""}, {prop: "readerWait", name: "readerWait", pkg: "sync", typ: $Int32, tag: ""}]);
	$pkg.$init = function() {
		$pkg.$init = function() {};
		/* */ var $r, $s = 0; var $init_sync = function() { while (true) { switch ($s) { case 0:
		$r = runtime.$init($BLOCKING); /* */ $s = 1; case 1: if ($r && $r.$blocking) { $r = $r(); }
		$r = atomic.$init($BLOCKING); /* */ $s = 2; case 2: if ($r && $r.$blocking) { $r = $r(); }
		allPools = sliceType.nil;
		semWaiters = new $Map();
		init();
		init$1();
		/* */ } return; } }; $init_sync.$blocking = true; return $init_sync;
	};
	return $pkg;
})();
$packages["io"] = (function() {
	var $pkg = {}, errors, runtime, sync, RuneReader, errWhence, errOffset;
	errors = $packages["errors"];
	runtime = $packages["runtime"];
	sync = $packages["sync"];
	RuneReader = $pkg.RuneReader = $newType(8, $kindInterface, "io.RuneReader", "RuneReader", "io", null);
	RuneReader.init([{prop: "ReadRune", name: "ReadRune", pkg: "", typ: $funcType([], [$Int32, $Int, $error], false)}]);
	$pkg.$init = function() {
		$pkg.$init = function() {};
		/* */ var $r, $s = 0; var $init_io = function() { while (true) { switch ($s) { case 0:
		$r = errors.$init($BLOCKING); /* */ $s = 1; case 1: if ($r && $r.$blocking) { $r = $r(); }
		$r = runtime.$init($BLOCKING); /* */ $s = 2; case 2: if ($r && $r.$blocking) { $r = $r(); }
		$r = sync.$init($BLOCKING); /* */ $s = 3; case 3: if ($r && $r.$blocking) { $r = $r(); }
		$pkg.ErrShortWrite = errors.New("short write");
		$pkg.ErrShortBuffer = errors.New("short buffer");
		$pkg.EOF = errors.New("EOF");
		$pkg.ErrUnexpectedEOF = errors.New("unexpected EOF");
		$pkg.ErrNoProgress = errors.New("multiple Read calls return no data or error");
		errWhence = errors.New("Seek: invalid whence");
		errOffset = errors.New("Seek: invalid offset");
		$pkg.ErrClosedPipe = errors.New("io: read/write on closed pipe");
		/* */ } return; } }; $init_io.$blocking = true; return $init_io;
	};
	return $pkg;
})();
$packages["math"] = (function() {
	var $pkg = {}, js, arrayType, math, zero, posInf, negInf, nan, pow10tab, init, IsInf, Ldexp, Float32bits, Float32frombits, Float64bits, init$1;
	js = $packages["github.com/gopherjs/gopherjs/js"];
	arrayType = $arrayType($Float64, 70);
	init = function() {
		Float32bits(0);
		Float32frombits(0);
	};
	IsInf = $pkg.IsInf = function(f, sign) {
		var f, sign;
		if (f === posInf) {
			return sign >= 0;
		}
		if (f === negInf) {
			return sign <= 0;
		}
		return false;
	};
	Ldexp = $pkg.Ldexp = function(frac, exp$1) {
		var exp$1, frac;
		if (frac === 0) {
			return frac;
		}
		if (exp$1 >= 1024) {
			return frac * $parseFloat(math.pow(2, 1023)) * $parseFloat(math.pow(2, exp$1 - 1023 >> 0));
		}
		if (exp$1 <= -1024) {
			return frac * $parseFloat(math.pow(2, -1023)) * $parseFloat(math.pow(2, exp$1 + 1023 >> 0));
		}
		return frac * $parseFloat(math.pow(2, exp$1));
	};
	Float32bits = $pkg.Float32bits = function(f) {
		var e, f, r, s;
		if (f === 0) {
			if (1 / f === negInf) {
				return 2147483648;
			}
			return 0;
		}
		if (!(f === f)) {
			return 2143289344;
		}
		s = 0;
		if (f < 0) {
			s = 2147483648;
			f = -f;
		}
		e = 150;
		while (true) {
			if (!(f >= 1.6777216e+07)) { break; }
			f = f / (2);
			e = e + (1) >>> 0;
			if (e === 255) {
				if (f >= 8.388608e+06) {
					f = posInf;
				}
				break;
			}
		}
		while (true) {
			if (!(f < 8.388608e+06)) { break; }
			e = e - (1) >>> 0;
			if (e === 0) {
				break;
			}
			f = f * (2);
		}
		r = $parseFloat($mod(f, 2));
		if ((r > 0.5 && r < 1) || r >= 1.5) {
			f = f + (1);
		}
		return (((s | (e << 23 >>> 0)) >>> 0) | (((f >> 0) & ~8388608))) >>> 0;
	};
	Float32frombits = $pkg.Float32frombits = function(b) {
		var b, e, m, s;
		s = 1;
		if (!((((b & 2147483648) >>> 0) === 0))) {
			s = -1;
		}
		e = (((b >>> 23 >>> 0)) & 255) >>> 0;
		m = (b & 8388607) >>> 0;
		if (e === 255) {
			if (m === 0) {
				return s / 0;
			}
			return nan;
		}
		if (!((e === 0))) {
			m = m + (8388608) >>> 0;
		}
		if (e === 0) {
			e = 1;
		}
		return Ldexp(m, ((e >> 0) - 127 >> 0) - 23 >> 0) * s;
	};
	Float64bits = $pkg.Float64bits = function(f) {
		var e, f, s, x, x$1, x$2, x$3;
		if (f === 0) {
			if (1 / f === negInf) {
				return new $Uint64(2147483648, 0);
			}
			return new $Uint64(0, 0);
		}
		if (!((f === f))) {
			return new $Uint64(2146959360, 1);
		}
		s = new $Uint64(0, 0);
		if (f < 0) {
			s = new $Uint64(2147483648, 0);
			f = -f;
		}
		e = 1075;
		while (true) {
			if (!(f >= 9.007199254740992e+15)) { break; }
			f = f / (2);
			e = e + (1) >>> 0;
			if (e === 2047) {
				break;
			}
		}
		while (true) {
			if (!(f < 4.503599627370496e+15)) { break; }
			e = e - (1) >>> 0;
			if (e === 0) {
				break;
			}
			f = f * (2);
		}
		return (x = (x$1 = $shiftLeft64(new $Uint64(0, e), 52), new $Uint64(s.$high | x$1.$high, (s.$low | x$1.$low) >>> 0)), x$2 = (x$3 = new $Uint64(0, f), new $Uint64(x$3.$high &~ 1048576, (x$3.$low &~ 0) >>> 0)), new $Uint64(x.$high | x$2.$high, (x.$low | x$2.$low) >>> 0));
	};
	init$1 = function() {
		var _q, i, m, x;
		pow10tab[0] = 1;
		pow10tab[1] = 10;
		i = 2;
		while (true) {
			if (!(i < 70)) { break; }
			m = (_q = i / 2, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero"));
			(i < 0 || i >= pow10tab.length) ? $throwRuntimeError("index out of range") : pow10tab[i] = ((m < 0 || m >= pow10tab.length) ? $throwRuntimeError("index out of range") : pow10tab[m]) * (x = i - m >> 0, ((x < 0 || x >= pow10tab.length) ? $throwRuntimeError("index out of range") : pow10tab[x]));
			i = i + (1) >> 0;
		}
	};
	$pkg.$init = function() {
		$pkg.$init = function() {};
		/* */ var $r, $s = 0; var $init_math = function() { while (true) { switch ($s) { case 0:
		$r = js.$init($BLOCKING); /* */ $s = 1; case 1: if ($r && $r.$blocking) { $r = $r(); }
		pow10tab = arrayType.zero();
		math = $global.Math;
		zero = 0;
		posInf = 1 / zero;
		negInf = -1 / zero;
		nan = 0 / zero;
		init();
		init$1();
		/* */ } return; } }; $init_math.$blocking = true; return $init_math;
	};
	return $pkg;
})();
$packages["unicode"] = (function() {
	var $pkg = {};
	$pkg.$init = function() {
		$pkg.$init = function() {};
		/* */ var $r, $s = 0; var $init_unicode = function() { while (true) { switch ($s) { case 0:
		/* */ } return; } }; $init_unicode.$blocking = true; return $init_unicode;
	};
	return $pkg;
})();
$packages["unicode/utf8"] = (function() {
	var $pkg = {}, decodeRuneInternal, decodeRuneInStringInternal, DecodeRune, DecodeRuneInString, RuneLen, EncodeRune, RuneCount, RuneCountInString;
	decodeRuneInternal = function(p) {
		var _tmp, _tmp$1, _tmp$10, _tmp$11, _tmp$12, _tmp$13, _tmp$14, _tmp$15, _tmp$16, _tmp$17, _tmp$18, _tmp$19, _tmp$2, _tmp$20, _tmp$21, _tmp$22, _tmp$23, _tmp$24, _tmp$25, _tmp$26, _tmp$27, _tmp$28, _tmp$29, _tmp$3, _tmp$30, _tmp$31, _tmp$32, _tmp$33, _tmp$34, _tmp$35, _tmp$36, _tmp$37, _tmp$38, _tmp$39, _tmp$4, _tmp$40, _tmp$41, _tmp$42, _tmp$43, _tmp$44, _tmp$45, _tmp$46, _tmp$47, _tmp$48, _tmp$49, _tmp$5, _tmp$50, _tmp$6, _tmp$7, _tmp$8, _tmp$9, c0, c1, c2, c3, n, p, r = 0, short$1 = false, size = 0;
		n = p.$length;
		if (n < 1) {
			_tmp = 65533; _tmp$1 = 0; _tmp$2 = true; r = _tmp; size = _tmp$1; short$1 = _tmp$2;
			return [r, size, short$1];
		}
		c0 = ((0 < 0 || 0 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 0]);
		if (c0 < 128) {
			_tmp$3 = (c0 >> 0); _tmp$4 = 1; _tmp$5 = false; r = _tmp$3; size = _tmp$4; short$1 = _tmp$5;
			return [r, size, short$1];
		}
		if (c0 < 192) {
			_tmp$6 = 65533; _tmp$7 = 1; _tmp$8 = false; r = _tmp$6; size = _tmp$7; short$1 = _tmp$8;
			return [r, size, short$1];
		}
		if (n < 2) {
			_tmp$9 = 65533; _tmp$10 = 1; _tmp$11 = true; r = _tmp$9; size = _tmp$10; short$1 = _tmp$11;
			return [r, size, short$1];
		}
		c1 = ((1 < 0 || 1 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 1]);
		if (c1 < 128 || 192 <= c1) {
			_tmp$12 = 65533; _tmp$13 = 1; _tmp$14 = false; r = _tmp$12; size = _tmp$13; short$1 = _tmp$14;
			return [r, size, short$1];
		}
		if (c0 < 224) {
			r = ((((c0 & 31) >>> 0) >> 0) << 6 >> 0) | (((c1 & 63) >>> 0) >> 0);
			if (r <= 127) {
				_tmp$15 = 65533; _tmp$16 = 1; _tmp$17 = false; r = _tmp$15; size = _tmp$16; short$1 = _tmp$17;
				return [r, size, short$1];
			}
			_tmp$18 = r; _tmp$19 = 2; _tmp$20 = false; r = _tmp$18; size = _tmp$19; short$1 = _tmp$20;
			return [r, size, short$1];
		}
		if (n < 3) {
			_tmp$21 = 65533; _tmp$22 = 1; _tmp$23 = true; r = _tmp$21; size = _tmp$22; short$1 = _tmp$23;
			return [r, size, short$1];
		}
		c2 = ((2 < 0 || 2 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 2]);
		if (c2 < 128 || 192 <= c2) {
			_tmp$24 = 65533; _tmp$25 = 1; _tmp$26 = false; r = _tmp$24; size = _tmp$25; short$1 = _tmp$26;
			return [r, size, short$1];
		}
		if (c0 < 240) {
			r = (((((c0 & 15) >>> 0) >> 0) << 12 >> 0) | ((((c1 & 63) >>> 0) >> 0) << 6 >> 0)) | (((c2 & 63) >>> 0) >> 0);
			if (r <= 2047) {
				_tmp$27 = 65533; _tmp$28 = 1; _tmp$29 = false; r = _tmp$27; size = _tmp$28; short$1 = _tmp$29;
				return [r, size, short$1];
			}
			if (55296 <= r && r <= 57343) {
				_tmp$30 = 65533; _tmp$31 = 1; _tmp$32 = false; r = _tmp$30; size = _tmp$31; short$1 = _tmp$32;
				return [r, size, short$1];
			}
			_tmp$33 = r; _tmp$34 = 3; _tmp$35 = false; r = _tmp$33; size = _tmp$34; short$1 = _tmp$35;
			return [r, size, short$1];
		}
		if (n < 4) {
			_tmp$36 = 65533; _tmp$37 = 1; _tmp$38 = true; r = _tmp$36; size = _tmp$37; short$1 = _tmp$38;
			return [r, size, short$1];
		}
		c3 = ((3 < 0 || 3 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 3]);
		if (c3 < 128 || 192 <= c3) {
			_tmp$39 = 65533; _tmp$40 = 1; _tmp$41 = false; r = _tmp$39; size = _tmp$40; short$1 = _tmp$41;
			return [r, size, short$1];
		}
		if (c0 < 248) {
			r = ((((((c0 & 7) >>> 0) >> 0) << 18 >> 0) | ((((c1 & 63) >>> 0) >> 0) << 12 >> 0)) | ((((c2 & 63) >>> 0) >> 0) << 6 >> 0)) | (((c3 & 63) >>> 0) >> 0);
			if (r <= 65535 || 1114111 < r) {
				_tmp$42 = 65533; _tmp$43 = 1; _tmp$44 = false; r = _tmp$42; size = _tmp$43; short$1 = _tmp$44;
				return [r, size, short$1];
			}
			_tmp$45 = r; _tmp$46 = 4; _tmp$47 = false; r = _tmp$45; size = _tmp$46; short$1 = _tmp$47;
			return [r, size, short$1];
		}
		_tmp$48 = 65533; _tmp$49 = 1; _tmp$50 = false; r = _tmp$48; size = _tmp$49; short$1 = _tmp$50;
		return [r, size, short$1];
	};
	decodeRuneInStringInternal = function(s) {
		var _tmp, _tmp$1, _tmp$10, _tmp$11, _tmp$12, _tmp$13, _tmp$14, _tmp$15, _tmp$16, _tmp$17, _tmp$18, _tmp$19, _tmp$2, _tmp$20, _tmp$21, _tmp$22, _tmp$23, _tmp$24, _tmp$25, _tmp$26, _tmp$27, _tmp$28, _tmp$29, _tmp$3, _tmp$30, _tmp$31, _tmp$32, _tmp$33, _tmp$34, _tmp$35, _tmp$36, _tmp$37, _tmp$38, _tmp$39, _tmp$4, _tmp$40, _tmp$41, _tmp$42, _tmp$43, _tmp$44, _tmp$45, _tmp$46, _tmp$47, _tmp$48, _tmp$49, _tmp$5, _tmp$50, _tmp$6, _tmp$7, _tmp$8, _tmp$9, c0, c1, c2, c3, n, r = 0, s, short$1 = false, size = 0;
		n = s.length;
		if (n < 1) {
			_tmp = 65533; _tmp$1 = 0; _tmp$2 = true; r = _tmp; size = _tmp$1; short$1 = _tmp$2;
			return [r, size, short$1];
		}
		c0 = s.charCodeAt(0);
		if (c0 < 128) {
			_tmp$3 = (c0 >> 0); _tmp$4 = 1; _tmp$5 = false; r = _tmp$3; size = _tmp$4; short$1 = _tmp$5;
			return [r, size, short$1];
		}
		if (c0 < 192) {
			_tmp$6 = 65533; _tmp$7 = 1; _tmp$8 = false; r = _tmp$6; size = _tmp$7; short$1 = _tmp$8;
			return [r, size, short$1];
		}
		if (n < 2) {
			_tmp$9 = 65533; _tmp$10 = 1; _tmp$11 = true; r = _tmp$9; size = _tmp$10; short$1 = _tmp$11;
			return [r, size, short$1];
		}
		c1 = s.charCodeAt(1);
		if (c1 < 128 || 192 <= c1) {
			_tmp$12 = 65533; _tmp$13 = 1; _tmp$14 = false; r = _tmp$12; size = _tmp$13; short$1 = _tmp$14;
			return [r, size, short$1];
		}
		if (c0 < 224) {
			r = ((((c0 & 31) >>> 0) >> 0) << 6 >> 0) | (((c1 & 63) >>> 0) >> 0);
			if (r <= 127) {
				_tmp$15 = 65533; _tmp$16 = 1; _tmp$17 = false; r = _tmp$15; size = _tmp$16; short$1 = _tmp$17;
				return [r, size, short$1];
			}
			_tmp$18 = r; _tmp$19 = 2; _tmp$20 = false; r = _tmp$18; size = _tmp$19; short$1 = _tmp$20;
			return [r, size, short$1];
		}
		if (n < 3) {
			_tmp$21 = 65533; _tmp$22 = 1; _tmp$23 = true; r = _tmp$21; size = _tmp$22; short$1 = _tmp$23;
			return [r, size, short$1];
		}
		c2 = s.charCodeAt(2);
		if (c2 < 128 || 192 <= c2) {
			_tmp$24 = 65533; _tmp$25 = 1; _tmp$26 = false; r = _tmp$24; size = _tmp$25; short$1 = _tmp$26;
			return [r, size, short$1];
		}
		if (c0 < 240) {
			r = (((((c0 & 15) >>> 0) >> 0) << 12 >> 0) | ((((c1 & 63) >>> 0) >> 0) << 6 >> 0)) | (((c2 & 63) >>> 0) >> 0);
			if (r <= 2047) {
				_tmp$27 = 65533; _tmp$28 = 1; _tmp$29 = false; r = _tmp$27; size = _tmp$28; short$1 = _tmp$29;
				return [r, size, short$1];
			}
			if (55296 <= r && r <= 57343) {
				_tmp$30 = 65533; _tmp$31 = 1; _tmp$32 = false; r = _tmp$30; size = _tmp$31; short$1 = _tmp$32;
				return [r, size, short$1];
			}
			_tmp$33 = r; _tmp$34 = 3; _tmp$35 = false; r = _tmp$33; size = _tmp$34; short$1 = _tmp$35;
			return [r, size, short$1];
		}
		if (n < 4) {
			_tmp$36 = 65533; _tmp$37 = 1; _tmp$38 = true; r = _tmp$36; size = _tmp$37; short$1 = _tmp$38;
			return [r, size, short$1];
		}
		c3 = s.charCodeAt(3);
		if (c3 < 128 || 192 <= c3) {
			_tmp$39 = 65533; _tmp$40 = 1; _tmp$41 = false; r = _tmp$39; size = _tmp$40; short$1 = _tmp$41;
			return [r, size, short$1];
		}
		if (c0 < 248) {
			r = ((((((c0 & 7) >>> 0) >> 0) << 18 >> 0) | ((((c1 & 63) >>> 0) >> 0) << 12 >> 0)) | ((((c2 & 63) >>> 0) >> 0) << 6 >> 0)) | (((c3 & 63) >>> 0) >> 0);
			if (r <= 65535 || 1114111 < r) {
				_tmp$42 = 65533; _tmp$43 = 1; _tmp$44 = false; r = _tmp$42; size = _tmp$43; short$1 = _tmp$44;
				return [r, size, short$1];
			}
			_tmp$45 = r; _tmp$46 = 4; _tmp$47 = false; r = _tmp$45; size = _tmp$46; short$1 = _tmp$47;
			return [r, size, short$1];
		}
		_tmp$48 = 65533; _tmp$49 = 1; _tmp$50 = false; r = _tmp$48; size = _tmp$49; short$1 = _tmp$50;
		return [r, size, short$1];
	};
	DecodeRune = $pkg.DecodeRune = function(p) {
		var _tuple, p, r = 0, size = 0;
		_tuple = decodeRuneInternal(p); r = _tuple[0]; size = _tuple[1];
		return [r, size];
	};
	DecodeRuneInString = $pkg.DecodeRuneInString = function(s) {
		var _tuple, r = 0, s, size = 0;
		_tuple = decodeRuneInStringInternal(s); r = _tuple[0]; size = _tuple[1];
		return [r, size];
	};
	RuneLen = $pkg.RuneLen = function(r) {
		var r;
		if (r < 0) {
			return -1;
		} else if (r <= 127) {
			return 1;
		} else if (r <= 2047) {
			return 2;
		} else if (55296 <= r && r <= 57343) {
			return -1;
		} else if (r <= 65535) {
			return 3;
		} else if (r <= 1114111) {
			return 4;
		}
		return -1;
	};
	EncodeRune = $pkg.EncodeRune = function(p, r) {
		var i, p, r;
		i = (r >>> 0);
		if (i <= 127) {
			(0 < 0 || 0 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 0] = (r << 24 >>> 24);
			return 1;
		} else if (i <= 2047) {
			(0 < 0 || 0 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 0] = (192 | ((r >> 6 >> 0) << 24 >>> 24)) >>> 0;
			(1 < 0 || 1 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 1] = (128 | (((r << 24 >>> 24) & 63) >>> 0)) >>> 0;
			return 2;
		} else if (i > 1114111 || 55296 <= i && i <= 57343) {
			r = 65533;
			(0 < 0 || 0 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 0] = (224 | ((r >> 12 >> 0) << 24 >>> 24)) >>> 0;
			(1 < 0 || 1 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 1] = (128 | ((((r >> 6 >> 0) << 24 >>> 24) & 63) >>> 0)) >>> 0;
			(2 < 0 || 2 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 2] = (128 | (((r << 24 >>> 24) & 63) >>> 0)) >>> 0;
			return 3;
		} else if (i <= 65535) {
			(0 < 0 || 0 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 0] = (224 | ((r >> 12 >> 0) << 24 >>> 24)) >>> 0;
			(1 < 0 || 1 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 1] = (128 | ((((r >> 6 >> 0) << 24 >>> 24) & 63) >>> 0)) >>> 0;
			(2 < 0 || 2 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 2] = (128 | (((r << 24 >>> 24) & 63) >>> 0)) >>> 0;
			return 3;
		} else {
			(0 < 0 || 0 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 0] = (240 | ((r >> 18 >> 0) << 24 >>> 24)) >>> 0;
			(1 < 0 || 1 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 1] = (128 | ((((r >> 12 >> 0) << 24 >>> 24) & 63) >>> 0)) >>> 0;
			(2 < 0 || 2 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 2] = (128 | ((((r >> 6 >> 0) << 24 >>> 24) & 63) >>> 0)) >>> 0;
			(3 < 0 || 3 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 3] = (128 | (((r << 24 >>> 24) & 63) >>> 0)) >>> 0;
			return 4;
		}
	};
	RuneCount = $pkg.RuneCount = function(p) {
		var _tuple, i, n, p, size;
		i = 0;
		n = 0;
		n = 0;
		while (true) {
			if (!(i < p.$length)) { break; }
			if (((i < 0 || i >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + i]) < 128) {
				i = i + (1) >> 0;
			} else {
				_tuple = DecodeRune($subslice(p, i)); size = _tuple[1];
				i = i + (size) >> 0;
			}
			n = n + (1) >> 0;
		}
		return n;
	};
	RuneCountInString = $pkg.RuneCountInString = function(s) {
		var _i, _ref, _rune, n = 0, s;
		_ref = s;
		_i = 0;
		while (true) {
			if (!(_i < _ref.length)) { break; }
			_rune = $decodeRune(_ref, _i);
			n = n + (1) >> 0;
			_i += _rune[1];
		}
		return n;
	};
	$pkg.$init = function() {
		$pkg.$init = function() {};
		/* */ var $r, $s = 0; var $init_utf8 = function() { while (true) { switch ($s) { case 0:
		/* */ } return; } }; $init_utf8.$blocking = true; return $init_utf8;
	};
	return $pkg;
})();
$packages["bytes"] = (function() {
	var $pkg = {}, errors, io, unicode, utf8, IndexByte;
	errors = $packages["errors"];
	io = $packages["io"];
	unicode = $packages["unicode"];
	utf8 = $packages["unicode/utf8"];
	IndexByte = $pkg.IndexByte = function(s, c) {
		var _i, _ref, b, c, i, s;
		_ref = s;
		_i = 0;
		while (true) {
			if (!(_i < _ref.$length)) { break; }
			i = _i;
			b = ((_i < 0 || _i >= _ref.$length) ? $throwRuntimeError("index out of range") : _ref.$array[_ref.$offset + _i]);
			if (b === c) {
				return i;
			}
			_i++;
		}
		return -1;
	};
	$pkg.$init = function() {
		$pkg.$init = function() {};
		/* */ var $r, $s = 0; var $init_bytes = function() { while (true) { switch ($s) { case 0:
		$r = errors.$init($BLOCKING); /* */ $s = 1; case 1: if ($r && $r.$blocking) { $r = $r(); }
		$r = io.$init($BLOCKING); /* */ $s = 2; case 2: if ($r && $r.$blocking) { $r = $r(); }
		$r = unicode.$init($BLOCKING); /* */ $s = 3; case 3: if ($r && $r.$blocking) { $r = $r(); }
		$r = utf8.$init($BLOCKING); /* */ $s = 4; case 4: if ($r && $r.$blocking) { $r = $r(); }
		$pkg.ErrTooLarge = errors.New("bytes.Buffer: too large");
		/* */ } return; } }; $init_bytes.$blocking = true; return $init_bytes;
	};
	return $pkg;
})();
$packages["syscall"] = (function() {
	var $pkg = {}, bytes, errors, js, runtime, sync, mmapper, Errno, _C_int, Timespec, Stat_t, Dirent, sliceType, sliceType$1, ptrType, sliceType$4, ptrType$10, arrayType$2, sliceType$9, arrayType$3, arrayType$4, structType, ptrType$24, mapType, funcType, funcType$1, ptrType$28, arrayType$8, arrayType$10, arrayType$12, warningPrinted, lineBuffer, syscallModule, alreadyTriedToLoad, minusOne, envOnce, envLock, env, envs, mapper, errors$1, init, printWarning, printToConsole, use, runtime_envs, syscall, Syscall, Syscall6, BytePtrFromString, copyenv, Getenv, itoa, uitoa, ByteSliceFromString, ReadDirent, Sysctl, nametomib, ParseDirent, Read, Write, sysctl, Close, Fchdir, Fchmod, Fchown, Fstat, Fsync, Ftruncate, Getdirentries, Lstat, Pread, Pwrite, read, Seek, write, mmap, munmap;
	bytes = $packages["bytes"];
	errors = $packages["errors"];
	js = $packages["github.com/gopherjs/gopherjs/js"];
	runtime = $packages["runtime"];
	sync = $packages["sync"];
	mmapper = $pkg.mmapper = $newType(0, $kindStruct, "syscall.mmapper", "mmapper", "syscall", function(Mutex_, active_, mmap_, munmap_) {
		this.$val = this;
		this.Mutex = Mutex_ !== undefined ? Mutex_ : new sync.Mutex.ptr();
		this.active = active_ !== undefined ? active_ : false;
		this.mmap = mmap_ !== undefined ? mmap_ : $throwNilPointerError;
		this.munmap = munmap_ !== undefined ? munmap_ : $throwNilPointerError;
	});
	Errno = $pkg.Errno = $newType(4, $kindUintptr, "syscall.Errno", "Errno", "syscall", null);
	_C_int = $pkg._C_int = $newType(4, $kindInt32, "syscall._C_int", "_C_int", "syscall", null);
	Timespec = $pkg.Timespec = $newType(0, $kindStruct, "syscall.Timespec", "Timespec", "syscall", function(Sec_, Nsec_) {
		this.$val = this;
		this.Sec = Sec_ !== undefined ? Sec_ : new $Int64(0, 0);
		this.Nsec = Nsec_ !== undefined ? Nsec_ : new $Int64(0, 0);
	});
	Stat_t = $pkg.Stat_t = $newType(0, $kindStruct, "syscall.Stat_t", "Stat_t", "syscall", function(Dev_, Mode_, Nlink_, Ino_, Uid_, Gid_, Rdev_, Pad_cgo_0_, Atimespec_, Mtimespec_, Ctimespec_, Birthtimespec_, Size_, Blocks_, Blksize_, Flags_, Gen_, Lspare_, Qspare_) {
		this.$val = this;
		this.Dev = Dev_ !== undefined ? Dev_ : 0;
		this.Mode = Mode_ !== undefined ? Mode_ : 0;
		this.Nlink = Nlink_ !== undefined ? Nlink_ : 0;
		this.Ino = Ino_ !== undefined ? Ino_ : new $Uint64(0, 0);
		this.Uid = Uid_ !== undefined ? Uid_ : 0;
		this.Gid = Gid_ !== undefined ? Gid_ : 0;
		this.Rdev = Rdev_ !== undefined ? Rdev_ : 0;
		this.Pad_cgo_0 = Pad_cgo_0_ !== undefined ? Pad_cgo_0_ : arrayType$3.zero();
		this.Atimespec = Atimespec_ !== undefined ? Atimespec_ : new Timespec.ptr();
		this.Mtimespec = Mtimespec_ !== undefined ? Mtimespec_ : new Timespec.ptr();
		this.Ctimespec = Ctimespec_ !== undefined ? Ctimespec_ : new Timespec.ptr();
		this.Birthtimespec = Birthtimespec_ !== undefined ? Birthtimespec_ : new Timespec.ptr();
		this.Size = Size_ !== undefined ? Size_ : new $Int64(0, 0);
		this.Blocks = Blocks_ !== undefined ? Blocks_ : new $Int64(0, 0);
		this.Blksize = Blksize_ !== undefined ? Blksize_ : 0;
		this.Flags = Flags_ !== undefined ? Flags_ : 0;
		this.Gen = Gen_ !== undefined ? Gen_ : 0;
		this.Lspare = Lspare_ !== undefined ? Lspare_ : 0;
		this.Qspare = Qspare_ !== undefined ? Qspare_ : arrayType$8.zero();
	});
	Dirent = $pkg.Dirent = $newType(0, $kindStruct, "syscall.Dirent", "Dirent", "syscall", function(Ino_, Seekoff_, Reclen_, Namlen_, Type_, Name_, Pad_cgo_0_) {
		this.$val = this;
		this.Ino = Ino_ !== undefined ? Ino_ : new $Uint64(0, 0);
		this.Seekoff = Seekoff_ !== undefined ? Seekoff_ : new $Uint64(0, 0);
		this.Reclen = Reclen_ !== undefined ? Reclen_ : 0;
		this.Namlen = Namlen_ !== undefined ? Namlen_ : 0;
		this.Type = Type_ !== undefined ? Type_ : 0;
		this.Name = Name_ !== undefined ? Name_ : arrayType$10.zero();
		this.Pad_cgo_0 = Pad_cgo_0_ !== undefined ? Pad_cgo_0_ : arrayType$12.zero();
	});
	sliceType = $sliceType($Uint8);
	sliceType$1 = $sliceType($String);
	ptrType = $ptrType($Uint8);
	sliceType$4 = $sliceType(_C_int);
	ptrType$10 = $ptrType($Uintptr);
	arrayType$2 = $arrayType($Uint8, 32);
	sliceType$9 = $sliceType($Uint8);
	arrayType$3 = $arrayType($Uint8, 4);
	arrayType$4 = $arrayType(_C_int, 14);
	structType = $structType([{prop: "addr", name: "addr", pkg: "syscall", typ: $Uintptr, tag: ""}, {prop: "len", name: "len", pkg: "syscall", typ: $Int, tag: ""}, {prop: "cap", name: "cap", pkg: "syscall", typ: $Int, tag: ""}]);
	ptrType$24 = $ptrType(mmapper);
	mapType = $mapType(ptrType, sliceType);
	funcType = $funcType([$Uintptr, $Uintptr, $Int, $Int, $Int, $Int64], [$Uintptr, $error], false);
	funcType$1 = $funcType([$Uintptr, $Uintptr], [$error], false);
	ptrType$28 = $ptrType(Timespec);
	arrayType$8 = $arrayType($Int64, 2);
	arrayType$10 = $arrayType($Int8, 1024);
	arrayType$12 = $arrayType($Uint8, 3);
	init = function() {
		$flushConsole = (function() {
			if (!((lineBuffer.$length === 0))) {
				$global.console.log($externalize($bytesToString(lineBuffer), $String));
				lineBuffer = sliceType.nil;
			}
		});
	};
	printWarning = function() {
		if (!warningPrinted) {
			console.log("warning: system calls not available, see https://github.com/gopherjs/gopherjs/blob/master/doc/syscalls.md");
		}
		warningPrinted = true;
	};
	printToConsole = function(b) {
		var b, goPrintToConsole, i;
		goPrintToConsole = $global.goPrintToConsole;
		if (!(goPrintToConsole === undefined)) {
			goPrintToConsole(b);
			return;
		}
		lineBuffer = $appendSlice(lineBuffer, b);
		while (true) {
			if (!(true)) { break; }
			i = bytes.IndexByte(lineBuffer, 10);
			if (i === -1) {
				break;
			}
			$global.console.log($externalize($bytesToString($subslice(lineBuffer, 0, i)), $String));
			lineBuffer = $subslice(lineBuffer, (i + 1 >> 0));
		}
	};
	use = function(p) {
		var p;
	};
	runtime_envs = function() {
		var envkeys, envs$1, i, jsEnv, key, process;
		process = $global.process;
		if (process === undefined) {
			return sliceType$1.nil;
		}
		jsEnv = process.env;
		envkeys = $global.Object.keys(jsEnv);
		envs$1 = $makeSlice(sliceType$1, $parseInt(envkeys.length));
		i = 0;
		while (true) {
			if (!(i < $parseInt(envkeys.length))) { break; }
			key = $internalize(envkeys[i], $String);
			(i < 0 || i >= envs$1.$length) ? $throwRuntimeError("index out of range") : envs$1.$array[envs$1.$offset + i] = key + "=" + $internalize(jsEnv[$externalize(key, $String)], $String);
			i = i + (1) >> 0;
		}
		return envs$1;
	};
	syscall = function(name) {
		var $deferred = [], $err = null, name, require;
		/* */ try { $deferFrames.push($deferred);
		$deferred.push([(function() {
			$recover();
		}), []]);
		if (syscallModule === null) {
			if (alreadyTriedToLoad) {
				return null;
			}
			alreadyTriedToLoad = true;
			require = $global.require;
			if (require === undefined) {
				$panic(new $String(""));
			}
			syscallModule = require($externalize("syscall", $String));
		}
		return syscallModule[$externalize(name, $String)];
		/* */ } catch(err) { $err = err; return null; } finally { $deferFrames.pop(); $callDeferred($deferred, $err); }
	};
	Syscall = $pkg.Syscall = function(trap, a1, a2, a3) {
		var _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, _tmp$6, _tmp$7, _tmp$8, a1, a2, a3, array, err = 0, f, r, r1 = 0, r2 = 0, slice, trap;
		f = syscall("Syscall");
		if (!(f === null)) {
			r = f(trap, a1, a2, a3);
			_tmp = (($parseInt(r[0]) >> 0) >>> 0); _tmp$1 = (($parseInt(r[1]) >> 0) >>> 0); _tmp$2 = (($parseInt(r[2]) >> 0) >>> 0); r1 = _tmp; r2 = _tmp$1; err = _tmp$2;
			return [r1, r2, err];
		}
		if ((trap === 4) && ((a1 === 1) || (a1 === 2))) {
			array = a2;
			slice = $makeSlice(sliceType, $parseInt(array.length));
			slice.$array = array;
			printToConsole(slice);
			_tmp$3 = ($parseInt(array.length) >>> 0); _tmp$4 = 0; _tmp$5 = 0; r1 = _tmp$3; r2 = _tmp$4; err = _tmp$5;
			return [r1, r2, err];
		}
		printWarning();
		_tmp$6 = (minusOne >>> 0); _tmp$7 = 0; _tmp$8 = 13; r1 = _tmp$6; r2 = _tmp$7; err = _tmp$8;
		return [r1, r2, err];
	};
	Syscall6 = $pkg.Syscall6 = function(trap, a1, a2, a3, a4, a5, a6) {
		var _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, a1, a2, a3, a4, a5, a6, err = 0, f, r, r1 = 0, r2 = 0, trap;
		f = syscall("Syscall6");
		if (!(f === null)) {
			r = f(trap, a1, a2, a3, a4, a5, a6);
			_tmp = (($parseInt(r[0]) >> 0) >>> 0); _tmp$1 = (($parseInt(r[1]) >> 0) >>> 0); _tmp$2 = (($parseInt(r[2]) >> 0) >>> 0); r1 = _tmp; r2 = _tmp$1; err = _tmp$2;
			return [r1, r2, err];
		}
		if (!((trap === 202))) {
			printWarning();
		}
		_tmp$3 = (minusOne >>> 0); _tmp$4 = 0; _tmp$5 = 13; r1 = _tmp$3; r2 = _tmp$4; err = _tmp$5;
		return [r1, r2, err];
	};
	BytePtrFromString = $pkg.BytePtrFromString = function(s) {
		var _i, _ref, array, b, i, s;
		array = new ($global.Uint8Array)(s.length + 1 >> 0);
		_ref = new sliceType($stringToBytes(s));
		_i = 0;
		while (true) {
			if (!(_i < _ref.$length)) { break; }
			i = _i;
			b = ((_i < 0 || _i >= _ref.$length) ? $throwRuntimeError("index out of range") : _ref.$array[_ref.$offset + _i]);
			if (b === 0) {
				return [ptrType.nil, new Errno(22)];
			}
			array[i] = b;
			_i++;
		}
		array[s.length] = 0;
		return [array, $ifaceNil];
	};
	copyenv = function() {
		var _entry, _i, _key, _ref, _tuple, i, j, key, ok, s;
		env = new $Map();
		_ref = envs;
		_i = 0;
		while (true) {
			if (!(_i < _ref.$length)) { break; }
			i = _i;
			s = ((_i < 0 || _i >= _ref.$length) ? $throwRuntimeError("index out of range") : _ref.$array[_ref.$offset + _i]);
			j = 0;
			while (true) {
				if (!(j < s.length)) { break; }
				if (s.charCodeAt(j) === 61) {
					key = s.substring(0, j);
					_tuple = (_entry = env[key], _entry !== undefined ? [_entry.v, true] : [0, false]); ok = _tuple[1];
					if (!ok) {
						_key = key; (env || $throwRuntimeError("assignment to entry in nil map"))[_key] = { k: _key, v: i };
					} else {
						(i < 0 || i >= envs.$length) ? $throwRuntimeError("index out of range") : envs.$array[envs.$offset + i] = "";
					}
					break;
				}
				j = j + (1) >> 0;
			}
			_i++;
		}
	};
	Getenv = $pkg.Getenv = function(key, $b) {
		var $args = arguments, $deferred = [], $err = null, $r, $s = 0, $this = this, _entry, _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, _tmp$6, _tmp$7, _tuple, found = false, i, i$1, ok, s, value = "";
		/* */ if($b !== $BLOCKING) { $nonblockingCall(); }; var $blocking_Getenv = function() { try { $deferFrames.push($deferred); s: while (true) { switch ($s) { case 0:
		$r = envOnce.Do(copyenv, $BLOCKING); /* */ $s = 1; case 1: if ($r && $r.$blocking) { $r = $r(); }
		if (key.length === 0) {
			_tmp = ""; _tmp$1 = false; value = _tmp; found = _tmp$1;
			return [value, found];
		}
		$r = envLock.RLock($BLOCKING); /* */ $s = 2; case 2: if ($r && $r.$blocking) { $r = $r(); }
		$deferred.push([$methodVal(envLock, "RUnlock"), [$BLOCKING]]);
		_tuple = (_entry = env[key], _entry !== undefined ? [_entry.v, true] : [0, false]); i = _tuple[0]; ok = _tuple[1];
		if (!ok) {
			_tmp$2 = ""; _tmp$3 = false; value = _tmp$2; found = _tmp$3;
			return [value, found];
		}
		s = ((i < 0 || i >= envs.$length) ? $throwRuntimeError("index out of range") : envs.$array[envs.$offset + i]);
		i$1 = 0;
		while (true) {
			if (!(i$1 < s.length)) { break; }
			if (s.charCodeAt(i$1) === 61) {
				_tmp$4 = s.substring((i$1 + 1 >> 0)); _tmp$5 = true; value = _tmp$4; found = _tmp$5;
				return [value, found];
			}
			i$1 = i$1 + (1) >> 0;
		}
		_tmp$6 = ""; _tmp$7 = false; value = _tmp$6; found = _tmp$7;
		return [value, found];
		/* */ case -1: } return; } } catch(err) { $err = err; } finally { $deferFrames.pop(); if ($curGoroutine.asleep && !$jumpToDefer) { throw null; } $s = -1; $callDeferred($deferred, $err); return [value, found]; } }; $blocking_Getenv.$blocking = true; return $blocking_Getenv;
	};
	itoa = function(val) {
		var val;
		if (val < 0) {
			return "-" + uitoa((-val >>> 0));
		}
		return uitoa((val >>> 0));
	};
	uitoa = function(val) {
		var _q, _r, buf, i, val;
		buf = $clone(arrayType$2.zero(), arrayType$2);
		i = 31;
		while (true) {
			if (!(val >= 10)) { break; }
			(i < 0 || i >= buf.length) ? $throwRuntimeError("index out of range") : buf[i] = (((_r = val % 10, _r === _r ? _r : $throwRuntimeError("integer divide by zero")) + 48 >>> 0) << 24 >>> 24);
			i = i - (1) >> 0;
			val = (_q = val / (10), (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >>> 0 : $throwRuntimeError("integer divide by zero"));
		}
		(i < 0 || i >= buf.length) ? $throwRuntimeError("index out of range") : buf[i] = ((val + 48 >>> 0) << 24 >>> 24);
		return $bytesToString($subslice(new sliceType(buf), i));
	};
	ByteSliceFromString = $pkg.ByteSliceFromString = function(s) {
		var a, i, s;
		i = 0;
		while (true) {
			if (!(i < s.length)) { break; }
			if (s.charCodeAt(i) === 0) {
				return [sliceType.nil, new Errno(22)];
			}
			i = i + (1) >> 0;
		}
		a = $makeSlice(sliceType, (s.length + 1 >> 0));
		$copyString(a, s);
		return [a, $ifaceNil];
	};
	Timespec.ptr.prototype.Unix = function() {
		var _tmp, _tmp$1, nsec = new $Int64(0, 0), sec = new $Int64(0, 0), ts;
		ts = this;
		_tmp = ts.Sec; _tmp$1 = ts.Nsec; sec = _tmp; nsec = _tmp$1;
		return [sec, nsec];
	};
	Timespec.prototype.Unix = function() { return this.$val.Unix(); };
	Timespec.ptr.prototype.Nano = function() {
		var ts, x, x$1;
		ts = this;
		return (x = $mul64(ts.Sec, new $Int64(0, 1000000000)), x$1 = ts.Nsec, new $Int64(x.$high + x$1.$high, x.$low + x$1.$low));
	};
	Timespec.prototype.Nano = function() { return this.$val.Nano(); };
	ReadDirent = $pkg.ReadDirent = function(fd, buf) {
		var _tuple, base, buf, err = $ifaceNil, fd, n = 0;
		base = new Uint8Array(8);
		_tuple = Getdirentries(fd, buf, base); n = _tuple[0]; err = _tuple[1];
		if (true && ($interfaceIsEqual(err, new Errno(22)) || $interfaceIsEqual(err, new Errno(2)))) {
			err = $ifaceNil;
		}
		return [n, err];
	};
	Sysctl = $pkg.Sysctl = function(name) {
		var _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, _tmp$6, _tmp$7, _tmp$8, _tmp$9, _tuple, buf, err = $ifaceNil, mib, n, name, value = "", x;
		_tuple = nametomib(name); mib = _tuple[0]; err = _tuple[1];
		if (!($interfaceIsEqual(err, $ifaceNil))) {
			_tmp = ""; _tmp$1 = err; value = _tmp; err = _tmp$1;
			return [value, err];
		}
		n = 0;
		err = sysctl(mib, ptrType.nil, new ptrType$10(function() { return n; }, function($v) { n = $v; }), ptrType.nil, 0);
		if (!($interfaceIsEqual(err, $ifaceNil))) {
			_tmp$2 = ""; _tmp$3 = err; value = _tmp$2; err = _tmp$3;
			return [value, err];
		}
		if (n === 0) {
			_tmp$4 = ""; _tmp$5 = $ifaceNil; value = _tmp$4; err = _tmp$5;
			return [value, err];
		}
		buf = $makeSlice(sliceType, n);
		err = sysctl(mib, new ptrType(function() { return ((0 < 0 || 0 >= this.$target.$length) ? $throwRuntimeError("index out of range") : this.$target.$array[this.$target.$offset + 0]); }, function($v) { (0 < 0 || 0 >= this.$target.$length) ? $throwRuntimeError("index out of range") : this.$target.$array[this.$target.$offset + 0] = $v; }, buf), new ptrType$10(function() { return n; }, function($v) { n = $v; }), ptrType.nil, 0);
		if (!($interfaceIsEqual(err, $ifaceNil))) {
			_tmp$6 = ""; _tmp$7 = err; value = _tmp$6; err = _tmp$7;
			return [value, err];
		}
		if (n > 0 && ((x = n - 1 >>> 0, ((x < 0 || x >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + x])) === 0)) {
			n = n - (1) >>> 0;
		}
		_tmp$8 = $bytesToString($subslice(buf, 0, n)); _tmp$9 = $ifaceNil; value = _tmp$8; err = _tmp$9;
		return [value, err];
	};
	nametomib = function(name) {
		var _q, _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, _tuple, buf, bytes$1, err = $ifaceNil, mib = sliceType$4.nil, n, name, p;
		buf = $clone(arrayType$4.zero(), arrayType$4);
		n = 48;
		p = $sliceToArray(new sliceType$9(buf));
		_tuple = ByteSliceFromString(name); bytes$1 = _tuple[0]; err = _tuple[1];
		if (!($interfaceIsEqual(err, $ifaceNil))) {
			_tmp = sliceType$4.nil; _tmp$1 = err; mib = _tmp; err = _tmp$1;
			return [mib, err];
		}
		err = sysctl(new sliceType$4([0, 3]), p, new ptrType$10(function() { return n; }, function($v) { n = $v; }), new ptrType(function() { return ((0 < 0 || 0 >= this.$target.$length) ? $throwRuntimeError("index out of range") : this.$target.$array[this.$target.$offset + 0]); }, function($v) { (0 < 0 || 0 >= this.$target.$length) ? $throwRuntimeError("index out of range") : this.$target.$array[this.$target.$offset + 0] = $v; }, bytes$1), (name.length >>> 0));
		if (!($interfaceIsEqual(err, $ifaceNil))) {
			_tmp$2 = sliceType$4.nil; _tmp$3 = err; mib = _tmp$2; err = _tmp$3;
			return [mib, err];
		}
		_tmp$4 = $subslice(new sliceType$4(buf), 0, (_q = n / 4, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >>> 0 : $throwRuntimeError("integer divide by zero"))); _tmp$5 = $ifaceNil; mib = _tmp$4; err = _tmp$5;
		return [mib, err];
	};
	ParseDirent = $pkg.ParseDirent = function(buf, max, names) {
		var _array, _struct, _tmp, _tmp$1, _tmp$2, _view, buf, bytes$1, consumed = 0, count = 0, dirent, max, name, names, newnames = sliceType$1.nil, origlen, x;
		origlen = buf.$length;
		while (true) {
			if (!(!((max === 0)) && buf.$length > 0)) { break; }
			dirent = [undefined];
			dirent[0] = (_array = $sliceToArray(buf), _struct = new Dirent.ptr(), _view = new DataView(_array.buffer, _array.byteOffset), _struct.Ino = new $Uint64(_view.getUint32(4, true), _view.getUint32(0, true)), _struct.Seekoff = new $Uint64(_view.getUint32(12, true), _view.getUint32(8, true)), _struct.Reclen = _view.getUint16(16, true), _struct.Namlen = _view.getUint16(18, true), _struct.Type = _view.getUint8(20, true), _struct.Name = new ($nativeArray($kindInt8))(_array.buffer, $min(_array.byteOffset + 21, _array.buffer.byteLength)), _struct.Pad_cgo_0 = new ($nativeArray($kindUint8))(_array.buffer, $min(_array.byteOffset + 1045, _array.buffer.byteLength)), _struct);
			if (dirent[0].Reclen === 0) {
				buf = sliceType.nil;
				break;
			}
			buf = $subslice(buf, dirent[0].Reclen);
			if ((x = dirent[0].Ino, (x.$high === 0 && x.$low === 0))) {
				continue;
			}
			bytes$1 = $sliceToArray(new sliceType$9(dirent[0].Name));
			name = $bytesToString($subslice(new sliceType(bytes$1), 0, dirent[0].Namlen));
			if (name === "." || name === "..") {
				continue;
			}
			max = max - (1) >> 0;
			count = count + (1) >> 0;
			names = $append(names, name);
		}
		_tmp = origlen - buf.$length >> 0; _tmp$1 = count; _tmp$2 = names; consumed = _tmp; count = _tmp$1; newnames = _tmp$2;
		return [consumed, count, newnames];
	};
	mmapper.ptr.prototype.Mmap = function(fd, offset, length, prot, flags, $b) {
		var $args = arguments, $deferred = [], $err = null, $r, $s = 0, $this = this, _key, _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, _tuple, addr, b, data = sliceType.nil, err = $ifaceNil, errno, m, p, sl, x, x$1;
		/* */ if($b !== $BLOCKING) { $nonblockingCall(); }; var $blocking_Mmap = function() { try { $deferFrames.push($deferred); s: while (true) { switch ($s) { case 0:
		m = $this;
		if (length <= 0) {
			_tmp = sliceType.nil; _tmp$1 = new Errno(22); data = _tmp; err = _tmp$1;
			return [data, err];
		}
		_tuple = m.mmap(0, (length >>> 0), prot, flags, fd, offset); addr = _tuple[0]; errno = _tuple[1];
		if (!($interfaceIsEqual(errno, $ifaceNil))) {
			_tmp$2 = sliceType.nil; _tmp$3 = errno; data = _tmp$2; err = _tmp$3;
			return [data, err];
		}
		sl = new structType.ptr(addr, length, length);
		b = sl;
		p = new ptrType(function() { return (x$1 = b.$capacity - 1 >> 0, ((x$1 < 0 || x$1 >= this.$target.$length) ? $throwRuntimeError("index out of range") : this.$target.$array[this.$target.$offset + x$1])); }, function($v) { (x = b.$capacity - 1 >> 0, (x < 0 || x >= this.$target.$length) ? $throwRuntimeError("index out of range") : this.$target.$array[this.$target.$offset + x] = $v); }, b);
		$r = m.Mutex.Lock($BLOCKING); /* */ $s = 1; case 1: if ($r && $r.$blocking) { $r = $r(); }
		$deferred.push([$methodVal(m.Mutex, "Unlock"), [$BLOCKING]]);
		_key = p; (m.active || $throwRuntimeError("assignment to entry in nil map"))[_key.$key()] = { k: _key, v: b };
		_tmp$4 = b; _tmp$5 = $ifaceNil; data = _tmp$4; err = _tmp$5;
		return [data, err];
		/* */ case -1: } return; } } catch(err) { $err = err; } finally { $deferFrames.pop(); if ($curGoroutine.asleep && !$jumpToDefer) { throw null; } $s = -1; $callDeferred($deferred, $err); return [data, err]; } }; $blocking_Mmap.$blocking = true; return $blocking_Mmap;
	};
	mmapper.prototype.Mmap = function(fd, offset, length, prot, flags, $b) { return this.$val.Mmap(fd, offset, length, prot, flags, $b); };
	mmapper.ptr.prototype.Munmap = function(data, $b) {
		var $args = arguments, $deferred = [], $err = null, $r, $s = 0, $this = this, _entry, b, err = $ifaceNil, errno, m, p, x, x$1;
		/* */ if($b !== $BLOCKING) { $nonblockingCall(); }; var $blocking_Munmap = function() { try { $deferFrames.push($deferred); s: while (true) { switch ($s) { case 0:
		m = $this;
		if ((data.$length === 0) || !((data.$length === data.$capacity))) {
			err = new Errno(22);
			return err;
		}
		p = new ptrType(function() { return (x$1 = data.$capacity - 1 >> 0, ((x$1 < 0 || x$1 >= this.$target.$length) ? $throwRuntimeError("index out of range") : this.$target.$array[this.$target.$offset + x$1])); }, function($v) { (x = data.$capacity - 1 >> 0, (x < 0 || x >= this.$target.$length) ? $throwRuntimeError("index out of range") : this.$target.$array[this.$target.$offset + x] = $v); }, data);
		$r = m.Mutex.Lock($BLOCKING); /* */ $s = 1; case 1: if ($r && $r.$blocking) { $r = $r(); }
		$deferred.push([$methodVal(m.Mutex, "Unlock"), [$BLOCKING]]);
		b = (_entry = m.active[p.$key()], _entry !== undefined ? _entry.v : sliceType.nil);
		if (b === sliceType.nil || !($pointerIsEqual(new ptrType(function() { return ((0 < 0 || 0 >= this.$target.$length) ? $throwRuntimeError("index out of range") : this.$target.$array[this.$target.$offset + 0]); }, function($v) { (0 < 0 || 0 >= this.$target.$length) ? $throwRuntimeError("index out of range") : this.$target.$array[this.$target.$offset + 0] = $v; }, b), new ptrType(function() { return ((0 < 0 || 0 >= this.$target.$length) ? $throwRuntimeError("index out of range") : this.$target.$array[this.$target.$offset + 0]); }, function($v) { (0 < 0 || 0 >= this.$target.$length) ? $throwRuntimeError("index out of range") : this.$target.$array[this.$target.$offset + 0] = $v; }, data)))) {
			err = new Errno(22);
			return err;
		}
		errno = m.munmap($sliceToArray(b), (b.$length >>> 0));
		if (!($interfaceIsEqual(errno, $ifaceNil))) {
			err = errno;
			return err;
		}
		delete m.active[p.$key()];
		err = $ifaceNil;
		return err;
		/* */ case -1: } return; } } catch(err) { $err = err; } finally { $deferFrames.pop(); if ($curGoroutine.asleep && !$jumpToDefer) { throw null; } $s = -1; $callDeferred($deferred, $err); return err; } }; $blocking_Munmap.$blocking = true; return $blocking_Munmap;
	};
	mmapper.prototype.Munmap = function(data, $b) { return this.$val.Munmap(data, $b); };
	Errno.prototype.Error = function() {
		var e, s;
		e = this.$val;
		if (0 <= (e >> 0) && (e >> 0) < 106) {
			s = ((e < 0 || e >= errors$1.length) ? $throwRuntimeError("index out of range") : errors$1[e]);
			if (!(s === "")) {
				return s;
			}
		}
		return "errno " + itoa((e >> 0));
	};
	$ptrType(Errno).prototype.Error = function() { return new Errno(this.$get()).Error(); };
	Errno.prototype.Temporary = function() {
		var e;
		e = this.$val;
		return (e === 4) || (e === 24) || (e === 54) || (e === 53) || new Errno(e).Timeout();
	};
	$ptrType(Errno).prototype.Temporary = function() { return new Errno(this.$get()).Temporary(); };
	Errno.prototype.Timeout = function() {
		var e;
		e = this.$val;
		return (e === 35) || (e === 35) || (e === 60);
	};
	$ptrType(Errno).prototype.Timeout = function() { return new Errno(this.$get()).Timeout(); };
	Read = $pkg.Read = function(fd, p) {
		var _tuple, err = $ifaceNil, fd, n = 0, p;
		_tuple = read(fd, p); n = _tuple[0]; err = _tuple[1];
		return [n, err];
	};
	Write = $pkg.Write = function(fd, p) {
		var _tuple, err = $ifaceNil, fd, n = 0, p;
		_tuple = write(fd, p); n = _tuple[0]; err = _tuple[1];
		return [n, err];
	};
	sysctl = function(mib, old, oldlen, new$1, newlen) {
		var _p0, _tuple, e1, err = $ifaceNil, mib, new$1, newlen, old, oldlen;
		_p0 = 0;
		if (mib.$length > 0) {
			_p0 = $sliceToArray(mib);
		} else {
			_p0 = new Uint8Array(0);
		}
		_tuple = Syscall6(202, _p0, (mib.$length >>> 0), old, oldlen, new$1, newlen); e1 = _tuple[2];
		if (!((e1 === 0))) {
			err = new Errno(e1);
		}
		return err;
	};
	Close = $pkg.Close = function(fd) {
		var _tuple, e1, err = $ifaceNil, fd;
		_tuple = Syscall(6, (fd >>> 0), 0, 0); e1 = _tuple[2];
		if (!((e1 === 0))) {
			err = new Errno(e1);
		}
		return err;
	};
	Fchdir = $pkg.Fchdir = function(fd) {
		var _tuple, e1, err = $ifaceNil, fd;
		_tuple = Syscall(13, (fd >>> 0), 0, 0); e1 = _tuple[2];
		if (!((e1 === 0))) {
			err = new Errno(e1);
		}
		return err;
	};
	Fchmod = $pkg.Fchmod = function(fd, mode) {
		var _tuple, e1, err = $ifaceNil, fd, mode;
		_tuple = Syscall(124, (fd >>> 0), (mode >>> 0), 0); e1 = _tuple[2];
		if (!((e1 === 0))) {
			err = new Errno(e1);
		}
		return err;
	};
	Fchown = $pkg.Fchown = function(fd, uid, gid) {
		var _tuple, e1, err = $ifaceNil, fd, gid, uid;
		_tuple = Syscall(123, (fd >>> 0), (uid >>> 0), (gid >>> 0)); e1 = _tuple[2];
		if (!((e1 === 0))) {
			err = new Errno(e1);
		}
		return err;
	};
	Fstat = $pkg.Fstat = function(fd, stat) {
		var _array, _struct, _tuple, _view, e1, err = $ifaceNil, fd, stat;
		_array = new Uint8Array(144);
		_tuple = Syscall(339, (fd >>> 0), _array, 0); e1 = _tuple[2];
		_struct = stat, _view = new DataView(_array.buffer, _array.byteOffset), _struct.Dev = _view.getInt32(0, true), _struct.Mode = _view.getUint16(4, true), _struct.Nlink = _view.getUint16(6, true), _struct.Ino = new $Uint64(_view.getUint32(12, true), _view.getUint32(8, true)), _struct.Uid = _view.getUint32(16, true), _struct.Gid = _view.getUint32(20, true), _struct.Rdev = _view.getInt32(24, true), _struct.Pad_cgo_0 = new ($nativeArray($kindUint8))(_array.buffer, $min(_array.byteOffset + 28, _array.buffer.byteLength)), _struct.Atimespec.Sec = new $Int64(_view.getUint32(36, true), _view.getUint32(32, true)), _struct.Atimespec.Nsec = new $Int64(_view.getUint32(44, true), _view.getUint32(40, true)), _struct.Mtimespec.Sec = new $Int64(_view.getUint32(52, true), _view.getUint32(48, true)), _struct.Mtimespec.Nsec = new $Int64(_view.getUint32(60, true), _view.getUint32(56, true)), _struct.Ctimespec.Sec = new $Int64(_view.getUint32(68, true), _view.getUint32(64, true)), _struct.Ctimespec.Nsec = new $Int64(_view.getUint32(76, true), _view.getUint32(72, true)), _struct.Birthtimespec.Sec = new $Int64(_view.getUint32(84, true), _view.getUint32(80, true)), _struct.Birthtimespec.Nsec = new $Int64(_view.getUint32(92, true), _view.getUint32(88, true)), _struct.Size = new $Int64(_view.getUint32(100, true), _view.getUint32(96, true)), _struct.Blocks = new $Int64(_view.getUint32(108, true), _view.getUint32(104, true)), _struct.Blksize = _view.getInt32(112, true), _struct.Flags = _view.getUint32(116, true), _struct.Gen = _view.getUint32(120, true), _struct.Lspare = _view.getInt32(124, true), _struct.Qspare = new ($nativeArray($kindInt64))(_array.buffer, $min(_array.byteOffset + 128, _array.buffer.byteLength));
		if (!((e1 === 0))) {
			err = new Errno(e1);
		}
		return err;
	};
	Fsync = $pkg.Fsync = function(fd) {
		var _tuple, e1, err = $ifaceNil, fd;
		_tuple = Syscall(95, (fd >>> 0), 0, 0); e1 = _tuple[2];
		if (!((e1 === 0))) {
			err = new Errno(e1);
		}
		return err;
	};
	Ftruncate = $pkg.Ftruncate = function(fd, length) {
		var _tuple, e1, err = $ifaceNil, fd, length;
		_tuple = Syscall(201, (fd >>> 0), (length.$low >>> 0), 0); e1 = _tuple[2];
		if (!((e1 === 0))) {
			err = new Errno(e1);
		}
		return err;
	};
	Getdirentries = $pkg.Getdirentries = function(fd, buf, basep) {
		var _p0, _tuple, basep, buf, e1, err = $ifaceNil, fd, n = 0, r0;
		_p0 = 0;
		if (buf.$length > 0) {
			_p0 = $sliceToArray(buf);
		} else {
			_p0 = new Uint8Array(0);
		}
		_tuple = Syscall6(344, (fd >>> 0), _p0, (buf.$length >>> 0), basep, 0, 0); r0 = _tuple[0]; e1 = _tuple[2];
		n = (r0 >> 0);
		if (!((e1 === 0))) {
			err = new Errno(e1);
		}
		return [n, err];
	};
	Lstat = $pkg.Lstat = function(path, stat) {
		var _array, _p0, _struct, _tuple, _tuple$1, _view, e1, err = $ifaceNil, path, stat;
		_p0 = ptrType.nil;
		_tuple = BytePtrFromString(path); _p0 = _tuple[0]; err = _tuple[1];
		if (!($interfaceIsEqual(err, $ifaceNil))) {
			return err;
		}
		_array = new Uint8Array(144);
		_tuple$1 = Syscall(340, _p0, _array, 0); e1 = _tuple$1[2];
		_struct = stat, _view = new DataView(_array.buffer, _array.byteOffset), _struct.Dev = _view.getInt32(0, true), _struct.Mode = _view.getUint16(4, true), _struct.Nlink = _view.getUint16(6, true), _struct.Ino = new $Uint64(_view.getUint32(12, true), _view.getUint32(8, true)), _struct.Uid = _view.getUint32(16, true), _struct.Gid = _view.getUint32(20, true), _struct.Rdev = _view.getInt32(24, true), _struct.Pad_cgo_0 = new ($nativeArray($kindUint8))(_array.buffer, $min(_array.byteOffset + 28, _array.buffer.byteLength)), _struct.Atimespec.Sec = new $Int64(_view.getUint32(36, true), _view.getUint32(32, true)), _struct.Atimespec.Nsec = new $Int64(_view.getUint32(44, true), _view.getUint32(40, true)), _struct.Mtimespec.Sec = new $Int64(_view.getUint32(52, true), _view.getUint32(48, true)), _struct.Mtimespec.Nsec = new $Int64(_view.getUint32(60, true), _view.getUint32(56, true)), _struct.Ctimespec.Sec = new $Int64(_view.getUint32(68, true), _view.getUint32(64, true)), _struct.Ctimespec.Nsec = new $Int64(_view.getUint32(76, true), _view.getUint32(72, true)), _struct.Birthtimespec.Sec = new $Int64(_view.getUint32(84, true), _view.getUint32(80, true)), _struct.Birthtimespec.Nsec = new $Int64(_view.getUint32(92, true), _view.getUint32(88, true)), _struct.Size = new $Int64(_view.getUint32(100, true), _view.getUint32(96, true)), _struct.Blocks = new $Int64(_view.getUint32(108, true), _view.getUint32(104, true)), _struct.Blksize = _view.getInt32(112, true), _struct.Flags = _view.getUint32(116, true), _struct.Gen = _view.getUint32(120, true), _struct.Lspare = _view.getInt32(124, true), _struct.Qspare = new ($nativeArray($kindInt64))(_array.buffer, $min(_array.byteOffset + 128, _array.buffer.byteLength));
		use(_p0);
		if (!((e1 === 0))) {
			err = new Errno(e1);
		}
		return err;
	};
	Pread = $pkg.Pread = function(fd, p, offset) {
		var _p0, _tuple, e1, err = $ifaceNil, fd, n = 0, offset, p, r0;
		_p0 = 0;
		if (p.$length > 0) {
			_p0 = $sliceToArray(p);
		} else {
			_p0 = new Uint8Array(0);
		}
		_tuple = Syscall6(153, (fd >>> 0), _p0, (p.$length >>> 0), (offset.$low >>> 0), 0, 0); r0 = _tuple[0]; e1 = _tuple[2];
		n = (r0 >> 0);
		if (!((e1 === 0))) {
			err = new Errno(e1);
		}
		return [n, err];
	};
	Pwrite = $pkg.Pwrite = function(fd, p, offset) {
		var _p0, _tuple, e1, err = $ifaceNil, fd, n = 0, offset, p, r0;
		_p0 = 0;
		if (p.$length > 0) {
			_p0 = $sliceToArray(p);
		} else {
			_p0 = new Uint8Array(0);
		}
		_tuple = Syscall6(154, (fd >>> 0), _p0, (p.$length >>> 0), (offset.$low >>> 0), 0, 0); r0 = _tuple[0]; e1 = _tuple[2];
		n = (r0 >> 0);
		if (!((e1 === 0))) {
			err = new Errno(e1);
		}
		return [n, err];
	};
	read = function(fd, p) {
		var _p0, _tuple, e1, err = $ifaceNil, fd, n = 0, p, r0;
		_p0 = 0;
		if (p.$length > 0) {
			_p0 = $sliceToArray(p);
		} else {
			_p0 = new Uint8Array(0);
		}
		_tuple = Syscall(3, (fd >>> 0), _p0, (p.$length >>> 0)); r0 = _tuple[0]; e1 = _tuple[2];
		n = (r0 >> 0);
		if (!((e1 === 0))) {
			err = new Errno(e1);
		}
		return [n, err];
	};
	Seek = $pkg.Seek = function(fd, offset, whence) {
		var _tuple, e1, err = $ifaceNil, fd, newoffset = new $Int64(0, 0), offset, r0, whence;
		_tuple = Syscall(199, (fd >>> 0), (offset.$low >>> 0), (whence >>> 0)); r0 = _tuple[0]; e1 = _tuple[2];
		newoffset = new $Int64(0, r0.constructor === Number ? r0 : 1);
		if (!((e1 === 0))) {
			err = new Errno(e1);
		}
		return [newoffset, err];
	};
	write = function(fd, p) {
		var _p0, _tuple, e1, err = $ifaceNil, fd, n = 0, p, r0;
		_p0 = 0;
		if (p.$length > 0) {
			_p0 = $sliceToArray(p);
		} else {
			_p0 = new Uint8Array(0);
		}
		_tuple = Syscall(4, (fd >>> 0), _p0, (p.$length >>> 0)); r0 = _tuple[0]; e1 = _tuple[2];
		n = (r0 >> 0);
		if (!((e1 === 0))) {
			err = new Errno(e1);
		}
		return [n, err];
	};
	mmap = function(addr, length, prot, flag, fd, pos) {
		var _tuple, addr, e1, err = $ifaceNil, fd, flag, length, pos, prot, r0, ret = 0;
		_tuple = Syscall6(197, addr, length, (prot >>> 0), (flag >>> 0), (fd >>> 0), (pos.$low >>> 0)); r0 = _tuple[0]; e1 = _tuple[2];
		ret = r0;
		if (!((e1 === 0))) {
			err = new Errno(e1);
		}
		return [ret, err];
	};
	munmap = function(addr, length) {
		var _tuple, addr, e1, err = $ifaceNil, length;
		_tuple = Syscall(73, addr, length, 0); e1 = _tuple[2];
		if (!((e1 === 0))) {
			err = new Errno(e1);
		}
		return err;
	};
	ptrType$24.methods = [{prop: "Mmap", name: "Mmap", pkg: "", typ: $funcType([$Int, $Int64, $Int, $Int, $Int], [sliceType, $error], false)}, {prop: "Munmap", name: "Munmap", pkg: "", typ: $funcType([sliceType], [$error], false)}];
	Errno.methods = [{prop: "Error", name: "Error", pkg: "", typ: $funcType([], [$String], false)}, {prop: "Temporary", name: "Temporary", pkg: "", typ: $funcType([], [$Bool], false)}, {prop: "Timeout", name: "Timeout", pkg: "", typ: $funcType([], [$Bool], false)}];
	ptrType$28.methods = [{prop: "Unix", name: "Unix", pkg: "", typ: $funcType([], [$Int64, $Int64], false)}, {prop: "Nano", name: "Nano", pkg: "", typ: $funcType([], [$Int64], false)}];
	mmapper.init([{prop: "Mutex", name: "", pkg: "", typ: sync.Mutex, tag: ""}, {prop: "active", name: "active", pkg: "syscall", typ: mapType, tag: ""}, {prop: "mmap", name: "mmap", pkg: "syscall", typ: funcType, tag: ""}, {prop: "munmap", name: "munmap", pkg: "syscall", typ: funcType$1, tag: ""}]);
	Timespec.init([{prop: "Sec", name: "Sec", pkg: "", typ: $Int64, tag: ""}, {prop: "Nsec", name: "Nsec", pkg: "", typ: $Int64, tag: ""}]);
	Stat_t.init([{prop: "Dev", name: "Dev", pkg: "", typ: $Int32, tag: ""}, {prop: "Mode", name: "Mode", pkg: "", typ: $Uint16, tag: ""}, {prop: "Nlink", name: "Nlink", pkg: "", typ: $Uint16, tag: ""}, {prop: "Ino", name: "Ino", pkg: "", typ: $Uint64, tag: ""}, {prop: "Uid", name: "Uid", pkg: "", typ: $Uint32, tag: ""}, {prop: "Gid", name: "Gid", pkg: "", typ: $Uint32, tag: ""}, {prop: "Rdev", name: "Rdev", pkg: "", typ: $Int32, tag: ""}, {prop: "Pad_cgo_0", name: "Pad_cgo_0", pkg: "", typ: arrayType$3, tag: ""}, {prop: "Atimespec", name: "Atimespec", pkg: "", typ: Timespec, tag: ""}, {prop: "Mtimespec", name: "Mtimespec", pkg: "", typ: Timespec, tag: ""}, {prop: "Ctimespec", name: "Ctimespec", pkg: "", typ: Timespec, tag: ""}, {prop: "Birthtimespec", name: "Birthtimespec", pkg: "", typ: Timespec, tag: ""}, {prop: "Size", name: "Size", pkg: "", typ: $Int64, tag: ""}, {prop: "Blocks", name: "Blocks", pkg: "", typ: $Int64, tag: ""}, {prop: "Blksize", name: "Blksize", pkg: "", typ: $Int32, tag: ""}, {prop: "Flags", name: "Flags", pkg: "", typ: $Uint32, tag: ""}, {prop: "Gen", name: "Gen", pkg: "", typ: $Uint32, tag: ""}, {prop: "Lspare", name: "Lspare", pkg: "", typ: $Int32, tag: ""}, {prop: "Qspare", name: "Qspare", pkg: "", typ: arrayType$8, tag: ""}]);
	Dirent.init([{prop: "Ino", name: "Ino", pkg: "", typ: $Uint64, tag: ""}, {prop: "Seekoff", name: "Seekoff", pkg: "", typ: $Uint64, tag: ""}, {prop: "Reclen", name: "Reclen", pkg: "", typ: $Uint16, tag: ""}, {prop: "Namlen", name: "Namlen", pkg: "", typ: $Uint16, tag: ""}, {prop: "Type", name: "Type", pkg: "", typ: $Uint8, tag: ""}, {prop: "Name", name: "Name", pkg: "", typ: arrayType$10, tag: ""}, {prop: "Pad_cgo_0", name: "Pad_cgo_0", pkg: "", typ: arrayType$12, tag: ""}]);
	$pkg.$init = function() {
		$pkg.$init = function() {};
		/* */ var $r, $s = 0; var $init_syscall = function() { while (true) { switch ($s) { case 0:
		$r = bytes.$init($BLOCKING); /* */ $s = 1; case 1: if ($r && $r.$blocking) { $r = $r(); }
		$r = errors.$init($BLOCKING); /* */ $s = 2; case 2: if ($r && $r.$blocking) { $r = $r(); }
		$r = js.$init($BLOCKING); /* */ $s = 3; case 3: if ($r && $r.$blocking) { $r = $r(); }
		$r = runtime.$init($BLOCKING); /* */ $s = 4; case 4: if ($r && $r.$blocking) { $r = $r(); }
		$r = sync.$init($BLOCKING); /* */ $s = 5; case 5: if ($r && $r.$blocking) { $r = $r(); }
		lineBuffer = sliceType.nil;
		envOnce = new sync.Once.ptr();
		envLock = new sync.RWMutex.ptr();
		env = false;
		warningPrinted = false;
		syscallModule = null;
		alreadyTriedToLoad = false;
		minusOne = -1;
		envs = runtime_envs();
		$pkg.Stdin = 0;
		$pkg.Stdout = 1;
		$pkg.Stderr = 2;
		errors$1 = $toNativeArray($kindString, ["", "operation not permitted", "no such file or directory", "no such process", "interrupted system call", "input/output error", "device not configured", "argument list too long", "exec format error", "bad file descriptor", "no child processes", "resource deadlock avoided", "cannot allocate memory", "permission denied", "bad address", "block device required", "resource busy", "file exists", "cross-device link", "operation not supported by device", "not a directory", "is a directory", "invalid argument", "too many open files in system", "too many open files", "inappropriate ioctl for device", "text file busy", "file too large", "no space left on device", "illegal seek", "read-only file system", "too many links", "broken pipe", "numerical argument out of domain", "result too large", "resource temporarily unavailable", "operation now in progress", "operation already in progress", "socket operation on non-socket", "destination address required", "message too long", "protocol wrong type for socket", "protocol not available", "protocol not supported", "socket type not supported", "operation not supported", "protocol family not supported", "address family not supported by protocol family", "address already in use", "can't assign requested address", "network is down", "network is unreachable", "network dropped connection on reset", "software caused connection abort", "connection reset by peer", "no buffer space available", "socket is already connected", "socket is not connected", "can't send after socket shutdown", "too many references: can't splice", "operation timed out", "connection refused", "too many levels of symbolic links", "file name too long", "host is down", "no route to host", "directory not empty", "too many processes", "too many users", "disc quota exceeded", "stale NFS file handle", "too many levels of remote in path", "RPC struct is bad", "RPC version wrong", "RPC prog. not avail", "program version wrong", "bad procedure for program", "no locks available", "function not implemented", "inappropriate file type or format", "authentication error", "need authenticator", "device power is off", "device error", "value too large to be stored in data type", "bad executable (or shared library)", "bad CPU type in executable", "shared library version mismatch", "malformed Mach-o file", "operation canceled", "identifier removed", "no message of desired type", "illegal byte sequence", "attribute not found", "bad message", "EMULTIHOP (Reserved)", "no message available on STREAM", "ENOLINK (Reserved)", "no STREAM resources", "not a STREAM", "protocol error", "STREAM ioctl timeout", "operation not supported on socket", "policy not found", "state not recoverable", "previous owner died"]);
		mapper = new mmapper.ptr(new sync.Mutex.ptr(), new $Map(), mmap, munmap);
		init();
		/* */ } return; } }; $init_syscall.$blocking = true; return $init_syscall;
	};
	return $pkg;
})();
$packages["github.com/gopherjs/gopherjs/nosync"] = (function() {
	var $pkg = {}, Once, funcType, ptrType$3;
	Once = $pkg.Once = $newType(0, $kindStruct, "nosync.Once", "Once", "github.com/gopherjs/gopherjs/nosync", function(doing_, done_) {
		this.$val = this;
		this.doing = doing_ !== undefined ? doing_ : false;
		this.done = done_ !== undefined ? done_ : false;
	});
	funcType = $funcType([], [], false);
	ptrType$3 = $ptrType(Once);
	Once.ptr.prototype.Do = function(f) {
		var $deferred = [], $err = null, f, o;
		/* */ try { $deferFrames.push($deferred);
		o = this;
		if (o.done) {
			return;
		}
		if (o.doing) {
			$panic(new $String("nosync: Do called within f"));
		}
		o.doing = true;
		$deferred.push([(function() {
			o.doing = false;
			o.done = true;
		}), []]);
		f();
		/* */ } catch(err) { $err = err; } finally { $deferFrames.pop(); $callDeferred($deferred, $err); }
	};
	Once.prototype.Do = function(f) { return this.$val.Do(f); };
	ptrType$3.methods = [{prop: "Do", name: "Do", pkg: "", typ: $funcType([funcType], [], false)}];
	Once.init([{prop: "doing", name: "doing", pkg: "github.com/gopherjs/gopherjs/nosync", typ: $Bool, tag: ""}, {prop: "done", name: "done", pkg: "github.com/gopherjs/gopherjs/nosync", typ: $Bool, tag: ""}]);
	$pkg.$init = function() {
		$pkg.$init = function() {};
		/* */ var $r, $s = 0; var $init_nosync = function() { while (true) { switch ($s) { case 0:
		/* */ } return; } }; $init_nosync.$blocking = true; return $init_nosync;
	};
	return $pkg;
})();
$packages["strings"] = (function() {
	var $pkg = {}, errors, js, io, unicode, utf8, IndexByte;
	errors = $packages["errors"];
	js = $packages["github.com/gopherjs/gopherjs/js"];
	io = $packages["io"];
	unicode = $packages["unicode"];
	utf8 = $packages["unicode/utf8"];
	IndexByte = $pkg.IndexByte = function(s, c) {
		var c, s;
		return $parseInt(s.indexOf($global.String.fromCharCode(c))) >> 0;
	};
	$pkg.$init = function() {
		$pkg.$init = function() {};
		/* */ var $r, $s = 0; var $init_strings = function() { while (true) { switch ($s) { case 0:
		$r = errors.$init($BLOCKING); /* */ $s = 1; case 1: if ($r && $r.$blocking) { $r = $r(); }
		$r = js.$init($BLOCKING); /* */ $s = 2; case 2: if ($r && $r.$blocking) { $r = $r(); }
		$r = io.$init($BLOCKING); /* */ $s = 3; case 3: if ($r && $r.$blocking) { $r = $r(); }
		$r = unicode.$init($BLOCKING); /* */ $s = 4; case 4: if ($r && $r.$blocking) { $r = $r(); }
		$r = utf8.$init($BLOCKING); /* */ $s = 5; case 5: if ($r && $r.$blocking) { $r = $r(); }
		/* */ } return; } }; $init_strings.$blocking = true; return $init_strings;
	};
	return $pkg;
})();
$packages["time"] = (function() {
	var $pkg = {}, errors, js, nosync, runtime, strings, syscall, ParseError, Time, Month, Weekday, Duration, Location, zone, zoneTrans, sliceType, sliceType$1, sliceType$2, ptrType, arrayType, sliceType$3, arrayType$1, arrayType$2, ptrType$1, ptrType$2, ptrType$5, std0x, longDayNames, shortDayNames, shortMonthNames, longMonthNames, atoiError, errBad, errLeadingInt, months, days, daysBefore, utcLoc, localLoc, localOnce, zoneinfo, badData, zoneDirs, _tuple, _r, initLocal, startsWithLowerCase, nextStdChunk, match, lookup, appendUint, atoi, formatNano, quote, isDigit, getnum, cutspace, skip, Parse, parse, parseTimeZone, parseGMT, parseNanoseconds, leadingInt, absWeekday, absClock, fmtFrac, fmtInt, absDate, Unix, isLeap, norm, Date, div, FixedZone;
	errors = $packages["errors"];
	js = $packages["github.com/gopherjs/gopherjs/js"];
	nosync = $packages["github.com/gopherjs/gopherjs/nosync"];
	runtime = $packages["runtime"];
	strings = $packages["strings"];
	syscall = $packages["syscall"];
	ParseError = $pkg.ParseError = $newType(0, $kindStruct, "time.ParseError", "ParseError", "time", function(Layout_, Value_, LayoutElem_, ValueElem_, Message_) {
		this.$val = this;
		this.Layout = Layout_ !== undefined ? Layout_ : "";
		this.Value = Value_ !== undefined ? Value_ : "";
		this.LayoutElem = LayoutElem_ !== undefined ? LayoutElem_ : "";
		this.ValueElem = ValueElem_ !== undefined ? ValueElem_ : "";
		this.Message = Message_ !== undefined ? Message_ : "";
	});
	Time = $pkg.Time = $newType(0, $kindStruct, "time.Time", "Time", "time", function(sec_, nsec_, loc_) {
		this.$val = this;
		this.sec = sec_ !== undefined ? sec_ : new $Int64(0, 0);
		this.nsec = nsec_ !== undefined ? nsec_ : 0;
		this.loc = loc_ !== undefined ? loc_ : ptrType$1.nil;
	});
	Month = $pkg.Month = $newType(4, $kindInt, "time.Month", "Month", "time", null);
	Weekday = $pkg.Weekday = $newType(4, $kindInt, "time.Weekday", "Weekday", "time", null);
	Duration = $pkg.Duration = $newType(8, $kindInt64, "time.Duration", "Duration", "time", null);
	Location = $pkg.Location = $newType(0, $kindStruct, "time.Location", "Location", "time", function(name_, zone_, tx_, cacheStart_, cacheEnd_, cacheZone_) {
		this.$val = this;
		this.name = name_ !== undefined ? name_ : "";
		this.zone = zone_ !== undefined ? zone_ : sliceType$1.nil;
		this.tx = tx_ !== undefined ? tx_ : sliceType$2.nil;
		this.cacheStart = cacheStart_ !== undefined ? cacheStart_ : new $Int64(0, 0);
		this.cacheEnd = cacheEnd_ !== undefined ? cacheEnd_ : new $Int64(0, 0);
		this.cacheZone = cacheZone_ !== undefined ? cacheZone_ : ptrType.nil;
	});
	zone = $pkg.zone = $newType(0, $kindStruct, "time.zone", "zone", "time", function(name_, offset_, isDST_) {
		this.$val = this;
		this.name = name_ !== undefined ? name_ : "";
		this.offset = offset_ !== undefined ? offset_ : 0;
		this.isDST = isDST_ !== undefined ? isDST_ : false;
	});
	zoneTrans = $pkg.zoneTrans = $newType(0, $kindStruct, "time.zoneTrans", "zoneTrans", "time", function(when_, index_, isstd_, isutc_) {
		this.$val = this;
		this.when = when_ !== undefined ? when_ : new $Int64(0, 0);
		this.index = index_ !== undefined ? index_ : 0;
		this.isstd = isstd_ !== undefined ? isstd_ : false;
		this.isutc = isutc_ !== undefined ? isutc_ : false;
	});
	sliceType = $sliceType($String);
	sliceType$1 = $sliceType(zone);
	sliceType$2 = $sliceType(zoneTrans);
	ptrType = $ptrType(zone);
	arrayType = $arrayType($Uint8, 32);
	sliceType$3 = $sliceType($Uint8);
	arrayType$1 = $arrayType($Uint8, 9);
	arrayType$2 = $arrayType($Uint8, 64);
	ptrType$1 = $ptrType(Location);
	ptrType$2 = $ptrType(ParseError);
	ptrType$5 = $ptrType(Time);
	initLocal = function() {
		var d, i, j, s;
		d = new ($global.Date)();
		s = $internalize(d, $String);
		i = strings.IndexByte(s, 40);
		j = strings.IndexByte(s, 41);
		if ((i === -1) || (j === -1)) {
			localLoc.name = "UTC";
			return;
		}
		localLoc.name = s.substring((i + 1 >> 0), j);
		localLoc.zone = new sliceType$1([new zone.ptr(localLoc.name, ($parseInt(d.getTimezoneOffset()) >> 0) * -60 >> 0, false)]);
	};
	startsWithLowerCase = function(str) {
		var c, str;
		if (str.length === 0) {
			return false;
		}
		c = str.charCodeAt(0);
		return 97 <= c && c <= 122;
	};
	nextStdChunk = function(layout) {
		var _ref, _tmp, _tmp$1, _tmp$10, _tmp$11, _tmp$12, _tmp$13, _tmp$14, _tmp$15, _tmp$16, _tmp$17, _tmp$18, _tmp$19, _tmp$2, _tmp$20, _tmp$21, _tmp$22, _tmp$23, _tmp$24, _tmp$25, _tmp$26, _tmp$27, _tmp$28, _tmp$29, _tmp$3, _tmp$30, _tmp$31, _tmp$32, _tmp$33, _tmp$34, _tmp$35, _tmp$36, _tmp$37, _tmp$38, _tmp$39, _tmp$4, _tmp$40, _tmp$41, _tmp$42, _tmp$43, _tmp$44, _tmp$45, _tmp$46, _tmp$47, _tmp$48, _tmp$49, _tmp$5, _tmp$50, _tmp$51, _tmp$52, _tmp$53, _tmp$54, _tmp$55, _tmp$56, _tmp$57, _tmp$58, _tmp$59, _tmp$6, _tmp$60, _tmp$61, _tmp$62, _tmp$63, _tmp$64, _tmp$65, _tmp$66, _tmp$67, _tmp$68, _tmp$69, _tmp$7, _tmp$70, _tmp$71, _tmp$72, _tmp$73, _tmp$74, _tmp$75, _tmp$76, _tmp$77, _tmp$78, _tmp$79, _tmp$8, _tmp$80, _tmp$9, c, ch, i, j, layout, prefix = "", std = 0, std$1, suffix = "", x;
		i = 0;
		while (true) {
			if (!(i < layout.length)) { break; }
			c = (layout.charCodeAt(i) >> 0);
			_ref = c;
			if (_ref === 74) {
				if (layout.length >= (i + 3 >> 0) && layout.substring(i, (i + 3 >> 0)) === "Jan") {
					if (layout.length >= (i + 7 >> 0) && layout.substring(i, (i + 7 >> 0)) === "January") {
						_tmp = layout.substring(0, i); _tmp$1 = 257; _tmp$2 = layout.substring((i + 7 >> 0)); prefix = _tmp; std = _tmp$1; suffix = _tmp$2;
						return [prefix, std, suffix];
					}
					if (!startsWithLowerCase(layout.substring((i + 3 >> 0)))) {
						_tmp$3 = layout.substring(0, i); _tmp$4 = 258; _tmp$5 = layout.substring((i + 3 >> 0)); prefix = _tmp$3; std = _tmp$4; suffix = _tmp$5;
						return [prefix, std, suffix];
					}
				}
			} else if (_ref === 77) {
				if (layout.length >= (i + 3 >> 0)) {
					if (layout.substring(i, (i + 3 >> 0)) === "Mon") {
						if (layout.length >= (i + 6 >> 0) && layout.substring(i, (i + 6 >> 0)) === "Monday") {
							_tmp$6 = layout.substring(0, i); _tmp$7 = 261; _tmp$8 = layout.substring((i + 6 >> 0)); prefix = _tmp$6; std = _tmp$7; suffix = _tmp$8;
							return [prefix, std, suffix];
						}
						if (!startsWithLowerCase(layout.substring((i + 3 >> 0)))) {
							_tmp$9 = layout.substring(0, i); _tmp$10 = 262; _tmp$11 = layout.substring((i + 3 >> 0)); prefix = _tmp$9; std = _tmp$10; suffix = _tmp$11;
							return [prefix, std, suffix];
						}
					}
					if (layout.substring(i, (i + 3 >> 0)) === "MST") {
						_tmp$12 = layout.substring(0, i); _tmp$13 = 21; _tmp$14 = layout.substring((i + 3 >> 0)); prefix = _tmp$12; std = _tmp$13; suffix = _tmp$14;
						return [prefix, std, suffix];
					}
				}
			} else if (_ref === 48) {
				if (layout.length >= (i + 2 >> 0) && 49 <= layout.charCodeAt((i + 1 >> 0)) && layout.charCodeAt((i + 1 >> 0)) <= 54) {
					_tmp$15 = layout.substring(0, i); _tmp$16 = (x = layout.charCodeAt((i + 1 >> 0)) - 49 << 24 >>> 24, ((x < 0 || x >= std0x.length) ? $throwRuntimeError("index out of range") : std0x[x])); _tmp$17 = layout.substring((i + 2 >> 0)); prefix = _tmp$15; std = _tmp$16; suffix = _tmp$17;
					return [prefix, std, suffix];
				}
			} else if (_ref === 49) {
				if (layout.length >= (i + 2 >> 0) && (layout.charCodeAt((i + 1 >> 0)) === 53)) {
					_tmp$18 = layout.substring(0, i); _tmp$19 = 522; _tmp$20 = layout.substring((i + 2 >> 0)); prefix = _tmp$18; std = _tmp$19; suffix = _tmp$20;
					return [prefix, std, suffix];
				}
				_tmp$21 = layout.substring(0, i); _tmp$22 = 259; _tmp$23 = layout.substring((i + 1 >> 0)); prefix = _tmp$21; std = _tmp$22; suffix = _tmp$23;
				return [prefix, std, suffix];
			} else if (_ref === 50) {
				if (layout.length >= (i + 4 >> 0) && layout.substring(i, (i + 4 >> 0)) === "2006") {
					_tmp$24 = layout.substring(0, i); _tmp$25 = 273; _tmp$26 = layout.substring((i + 4 >> 0)); prefix = _tmp$24; std = _tmp$25; suffix = _tmp$26;
					return [prefix, std, suffix];
				}
				_tmp$27 = layout.substring(0, i); _tmp$28 = 263; _tmp$29 = layout.substring((i + 1 >> 0)); prefix = _tmp$27; std = _tmp$28; suffix = _tmp$29;
				return [prefix, std, suffix];
			} else if (_ref === 95) {
				if (layout.length >= (i + 2 >> 0) && (layout.charCodeAt((i + 1 >> 0)) === 50)) {
					_tmp$30 = layout.substring(0, i); _tmp$31 = 264; _tmp$32 = layout.substring((i + 2 >> 0)); prefix = _tmp$30; std = _tmp$31; suffix = _tmp$32;
					return [prefix, std, suffix];
				}
			} else if (_ref === 51) {
				_tmp$33 = layout.substring(0, i); _tmp$34 = 523; _tmp$35 = layout.substring((i + 1 >> 0)); prefix = _tmp$33; std = _tmp$34; suffix = _tmp$35;
				return [prefix, std, suffix];
			} else if (_ref === 52) {
				_tmp$36 = layout.substring(0, i); _tmp$37 = 525; _tmp$38 = layout.substring((i + 1 >> 0)); prefix = _tmp$36; std = _tmp$37; suffix = _tmp$38;
				return [prefix, std, suffix];
			} else if (_ref === 53) {
				_tmp$39 = layout.substring(0, i); _tmp$40 = 527; _tmp$41 = layout.substring((i + 1 >> 0)); prefix = _tmp$39; std = _tmp$40; suffix = _tmp$41;
				return [prefix, std, suffix];
			} else if (_ref === 80) {
				if (layout.length >= (i + 2 >> 0) && (layout.charCodeAt((i + 1 >> 0)) === 77)) {
					_tmp$42 = layout.substring(0, i); _tmp$43 = 531; _tmp$44 = layout.substring((i + 2 >> 0)); prefix = _tmp$42; std = _tmp$43; suffix = _tmp$44;
					return [prefix, std, suffix];
				}
			} else if (_ref === 112) {
				if (layout.length >= (i + 2 >> 0) && (layout.charCodeAt((i + 1 >> 0)) === 109)) {
					_tmp$45 = layout.substring(0, i); _tmp$46 = 532; _tmp$47 = layout.substring((i + 2 >> 0)); prefix = _tmp$45; std = _tmp$46; suffix = _tmp$47;
					return [prefix, std, suffix];
				}
			} else if (_ref === 45) {
				if (layout.length >= (i + 7 >> 0) && layout.substring(i, (i + 7 >> 0)) === "-070000") {
					_tmp$48 = layout.substring(0, i); _tmp$49 = 27; _tmp$50 = layout.substring((i + 7 >> 0)); prefix = _tmp$48; std = _tmp$49; suffix = _tmp$50;
					return [prefix, std, suffix];
				}
				if (layout.length >= (i + 9 >> 0) && layout.substring(i, (i + 9 >> 0)) === "-07:00:00") {
					_tmp$51 = layout.substring(0, i); _tmp$52 = 30; _tmp$53 = layout.substring((i + 9 >> 0)); prefix = _tmp$51; std = _tmp$52; suffix = _tmp$53;
					return [prefix, std, suffix];
				}
				if (layout.length >= (i + 5 >> 0) && layout.substring(i, (i + 5 >> 0)) === "-0700") {
					_tmp$54 = layout.substring(0, i); _tmp$55 = 26; _tmp$56 = layout.substring((i + 5 >> 0)); prefix = _tmp$54; std = _tmp$55; suffix = _tmp$56;
					return [prefix, std, suffix];
				}
				if (layout.length >= (i + 6 >> 0) && layout.substring(i, (i + 6 >> 0)) === "-07:00") {
					_tmp$57 = layout.substring(0, i); _tmp$58 = 29; _tmp$59 = layout.substring((i + 6 >> 0)); prefix = _tmp$57; std = _tmp$58; suffix = _tmp$59;
					return [prefix, std, suffix];
				}
				if (layout.length >= (i + 3 >> 0) && layout.substring(i, (i + 3 >> 0)) === "-07") {
					_tmp$60 = layout.substring(0, i); _tmp$61 = 28; _tmp$62 = layout.substring((i + 3 >> 0)); prefix = _tmp$60; std = _tmp$61; suffix = _tmp$62;
					return [prefix, std, suffix];
				}
			} else if (_ref === 90) {
				if (layout.length >= (i + 7 >> 0) && layout.substring(i, (i + 7 >> 0)) === "Z070000") {
					_tmp$63 = layout.substring(0, i); _tmp$64 = 23; _tmp$65 = layout.substring((i + 7 >> 0)); prefix = _tmp$63; std = _tmp$64; suffix = _tmp$65;
					return [prefix, std, suffix];
				}
				if (layout.length >= (i + 9 >> 0) && layout.substring(i, (i + 9 >> 0)) === "Z07:00:00") {
					_tmp$66 = layout.substring(0, i); _tmp$67 = 25; _tmp$68 = layout.substring((i + 9 >> 0)); prefix = _tmp$66; std = _tmp$67; suffix = _tmp$68;
					return [prefix, std, suffix];
				}
				if (layout.length >= (i + 5 >> 0) && layout.substring(i, (i + 5 >> 0)) === "Z0700") {
					_tmp$69 = layout.substring(0, i); _tmp$70 = 22; _tmp$71 = layout.substring((i + 5 >> 0)); prefix = _tmp$69; std = _tmp$70; suffix = _tmp$71;
					return [prefix, std, suffix];
				}
				if (layout.length >= (i + 6 >> 0) && layout.substring(i, (i + 6 >> 0)) === "Z07:00") {
					_tmp$72 = layout.substring(0, i); _tmp$73 = 24; _tmp$74 = layout.substring((i + 6 >> 0)); prefix = _tmp$72; std = _tmp$73; suffix = _tmp$74;
					return [prefix, std, suffix];
				}
			} else if (_ref === 46) {
				if ((i + 1 >> 0) < layout.length && ((layout.charCodeAt((i + 1 >> 0)) === 48) || (layout.charCodeAt((i + 1 >> 0)) === 57))) {
					ch = layout.charCodeAt((i + 1 >> 0));
					j = i + 1 >> 0;
					while (true) {
						if (!(j < layout.length && (layout.charCodeAt(j) === ch))) { break; }
						j = j + (1) >> 0;
					}
					if (!isDigit(layout, j)) {
						std$1 = 31;
						if (layout.charCodeAt((i + 1 >> 0)) === 57) {
							std$1 = 32;
						}
						std$1 = std$1 | ((((j - ((i + 1 >> 0)) >> 0)) << 16 >> 0));
						_tmp$75 = layout.substring(0, i); _tmp$76 = std$1; _tmp$77 = layout.substring(j); prefix = _tmp$75; std = _tmp$76; suffix = _tmp$77;
						return [prefix, std, suffix];
					}
				}
			}
			i = i + (1) >> 0;
		}
		_tmp$78 = layout; _tmp$79 = 0; _tmp$80 = ""; prefix = _tmp$78; std = _tmp$79; suffix = _tmp$80;
		return [prefix, std, suffix];
	};
	match = function(s1, s2) {
		var c1, c2, i, s1, s2;
		i = 0;
		while (true) {
			if (!(i < s1.length)) { break; }
			c1 = s1.charCodeAt(i);
			c2 = s2.charCodeAt(i);
			if (!((c1 === c2))) {
				c1 = (c1 | (32)) >>> 0;
				c2 = (c2 | (32)) >>> 0;
				if (!((c1 === c2)) || c1 < 97 || c1 > 122) {
					return false;
				}
			}
			i = i + (1) >> 0;
		}
		return true;
	};
	lookup = function(tab, val) {
		var _i, _ref, i, tab, v, val;
		_ref = tab;
		_i = 0;
		while (true) {
			if (!(_i < _ref.$length)) { break; }
			i = _i;
			v = ((_i < 0 || _i >= _ref.$length) ? $throwRuntimeError("index out of range") : _ref.$array[_ref.$offset + _i]);
			if (val.length >= v.length && match(val.substring(0, v.length), v)) {
				return [i, val.substring(v.length), $ifaceNil];
			}
			_i++;
		}
		return [-1, val, errBad];
	};
	appendUint = function(b, x, pad) {
		var _q, _q$1, _r$1, _r$2, b, buf, n, pad, x;
		if (x < 10) {
			if (!((pad === 0))) {
				b = $append(b, pad);
			}
			return $append(b, ((48 + x >>> 0) << 24 >>> 24));
		}
		if (x < 100) {
			b = $append(b, ((48 + (_q = x / 10, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >>> 0 : $throwRuntimeError("integer divide by zero")) >>> 0) << 24 >>> 24));
			b = $append(b, ((48 + (_r$1 = x % 10, _r$1 === _r$1 ? _r$1 : $throwRuntimeError("integer divide by zero")) >>> 0) << 24 >>> 24));
			return b;
		}
		buf = $clone(arrayType.zero(), arrayType);
		n = 32;
		if (x === 0) {
			return $append(b, 48);
		}
		while (true) {
			if (!(x >= 10)) { break; }
			n = n - (1) >> 0;
			(n < 0 || n >= buf.length) ? $throwRuntimeError("index out of range") : buf[n] = (((_r$2 = x % 10, _r$2 === _r$2 ? _r$2 : $throwRuntimeError("integer divide by zero")) + 48 >>> 0) << 24 >>> 24);
			x = (_q$1 = x / (10), (_q$1 === _q$1 && _q$1 !== 1/0 && _q$1 !== -1/0) ? _q$1 >>> 0 : $throwRuntimeError("integer divide by zero"));
		}
		n = n - (1) >> 0;
		(n < 0 || n >= buf.length) ? $throwRuntimeError("index out of range") : buf[n] = ((x + 48 >>> 0) << 24 >>> 24);
		return $appendSlice(b, $subslice(new sliceType$3(buf), n));
	};
	atoi = function(s) {
		var _tmp, _tmp$1, _tmp$2, _tmp$3, _tuple$1, err = $ifaceNil, neg, q, rem, s, x = 0;
		neg = false;
		if (!(s === "") && ((s.charCodeAt(0) === 45) || (s.charCodeAt(0) === 43))) {
			neg = s.charCodeAt(0) === 45;
			s = s.substring(1);
		}
		_tuple$1 = leadingInt(s); q = _tuple$1[0]; rem = _tuple$1[1]; err = _tuple$1[2];
		x = ((q.$low + ((q.$high >> 31) * 4294967296)) >> 0);
		if (!($interfaceIsEqual(err, $ifaceNil)) || !(rem === "")) {
			_tmp = 0; _tmp$1 = atoiError; x = _tmp; err = _tmp$1;
			return [x, err];
		}
		if (neg) {
			x = -x;
		}
		_tmp$2 = x; _tmp$3 = $ifaceNil; x = _tmp$2; err = _tmp$3;
		return [x, err];
	};
	formatNano = function(b, nanosec, n, trim) {
		var _q, _r$1, b, buf, n, nanosec, start, trim, u, x;
		u = nanosec;
		buf = $clone(arrayType$1.zero(), arrayType$1);
		start = 9;
		while (true) {
			if (!(start > 0)) { break; }
			start = start - (1) >> 0;
			(start < 0 || start >= buf.length) ? $throwRuntimeError("index out of range") : buf[start] = (((_r$1 = u % 10, _r$1 === _r$1 ? _r$1 : $throwRuntimeError("integer divide by zero")) + 48 >>> 0) << 24 >>> 24);
			u = (_q = u / (10), (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >>> 0 : $throwRuntimeError("integer divide by zero"));
		}
		if (n > 9) {
			n = 9;
		}
		if (trim) {
			while (true) {
				if (!(n > 0 && ((x = n - 1 >> 0, ((x < 0 || x >= buf.length) ? $throwRuntimeError("index out of range") : buf[x])) === 48))) { break; }
				n = n - (1) >> 0;
			}
			if (n === 0) {
				return b;
			}
		}
		b = $append(b, 46);
		return $appendSlice(b, $subslice(new sliceType$3(buf), 0, n));
	};
	Time.ptr.prototype.String = function() {
		var t;
		t = $clone(this, Time);
		return t.Format("2006-01-02 15:04:05.999999999 -0700 MST");
	};
	Time.prototype.String = function() { return this.$val.String(); };
	Time.ptr.prototype.Format = function(layout) {
		var _q, _q$1, _q$2, _q$3, _r$1, _r$2, _r$3, _r$4, _r$5, _r$6, _ref, _tuple$1, _tuple$2, _tuple$3, _tuple$4, abs, absoffset, b, buf, day, hour, hr, hr$1, layout, m, max, min, month, name, offset, prefix, s, sec, std, suffix, t, y, y$1, year, zone$1, zone$2;
		t = $clone(this, Time);
		_tuple$1 = t.locabs(); name = _tuple$1[0]; offset = _tuple$1[1]; abs = _tuple$1[2];
		year = -1;
		month = 0;
		day = 0;
		hour = -1;
		min = 0;
		sec = 0;
		b = sliceType$3.nil;
		buf = $clone(arrayType$2.zero(), arrayType$2);
		max = layout.length + 10 >> 0;
		if (max <= 64) {
			b = $subslice(new sliceType$3(buf), 0, 0);
		} else {
			b = $makeSlice(sliceType$3, 0, max);
		}
		while (true) {
			if (!(!(layout === ""))) { break; }
			_tuple$2 = nextStdChunk(layout); prefix = _tuple$2[0]; std = _tuple$2[1]; suffix = _tuple$2[2];
			if (!(prefix === "")) {
				b = $appendSlice(b, new sliceType$3($stringToBytes(prefix)));
			}
			if (std === 0) {
				break;
			}
			layout = suffix;
			if (year < 0 && !(((std & 256) === 0))) {
				_tuple$3 = absDate(abs, true); year = _tuple$3[0]; month = _tuple$3[1]; day = _tuple$3[2];
			}
			if (hour < 0 && !(((std & 512) === 0))) {
				_tuple$4 = absClock(abs); hour = _tuple$4[0]; min = _tuple$4[1]; sec = _tuple$4[2];
			}
			_ref = std & 65535;
			switch (0) { default: if (_ref === 274) {
				y = year;
				if (y < 0) {
					y = -y;
				}
				b = appendUint(b, ((_r$1 = y % 100, _r$1 === _r$1 ? _r$1 : $throwRuntimeError("integer divide by zero")) >>> 0), 48);
			} else if (_ref === 273) {
				y$1 = year;
				if (year <= -1000) {
					b = $append(b, 45);
					y$1 = -y$1;
				} else if (year <= -100) {
					b = $appendSlice(b, new sliceType$3($stringToBytes("-0")));
					y$1 = -y$1;
				} else if (year <= -10) {
					b = $appendSlice(b, new sliceType$3($stringToBytes("-00")));
					y$1 = -y$1;
				} else if (year < 0) {
					b = $appendSlice(b, new sliceType$3($stringToBytes("-000")));
					y$1 = -y$1;
				} else if (year < 10) {
					b = $appendSlice(b, new sliceType$3($stringToBytes("000")));
				} else if (year < 100) {
					b = $appendSlice(b, new sliceType$3($stringToBytes("00")));
				} else if (year < 1000) {
					b = $append(b, 48);
				}
				b = appendUint(b, (y$1 >>> 0), 0);
			} else if (_ref === 258) {
				b = $appendSlice(b, new sliceType$3($stringToBytes(new Month(month).String().substring(0, 3))));
			} else if (_ref === 257) {
				m = new Month(month).String();
				b = $appendSlice(b, new sliceType$3($stringToBytes(m)));
			} else if (_ref === 259) {
				b = appendUint(b, (month >>> 0), 0);
			} else if (_ref === 260) {
				b = appendUint(b, (month >>> 0), 48);
			} else if (_ref === 262) {
				b = $appendSlice(b, new sliceType$3($stringToBytes(new Weekday(absWeekday(abs)).String().substring(0, 3))));
			} else if (_ref === 261) {
				s = new Weekday(absWeekday(abs)).String();
				b = $appendSlice(b, new sliceType$3($stringToBytes(s)));
			} else if (_ref === 263) {
				b = appendUint(b, (day >>> 0), 0);
			} else if (_ref === 264) {
				b = appendUint(b, (day >>> 0), 32);
			} else if (_ref === 265) {
				b = appendUint(b, (day >>> 0), 48);
			} else if (_ref === 522) {
				b = appendUint(b, (hour >>> 0), 48);
			} else if (_ref === 523) {
				hr = (_r$2 = hour % 12, _r$2 === _r$2 ? _r$2 : $throwRuntimeError("integer divide by zero"));
				if (hr === 0) {
					hr = 12;
				}
				b = appendUint(b, (hr >>> 0), 0);
			} else if (_ref === 524) {
				hr$1 = (_r$3 = hour % 12, _r$3 === _r$3 ? _r$3 : $throwRuntimeError("integer divide by zero"));
				if (hr$1 === 0) {
					hr$1 = 12;
				}
				b = appendUint(b, (hr$1 >>> 0), 48);
			} else if (_ref === 525) {
				b = appendUint(b, (min >>> 0), 0);
			} else if (_ref === 526) {
				b = appendUint(b, (min >>> 0), 48);
			} else if (_ref === 527) {
				b = appendUint(b, (sec >>> 0), 0);
			} else if (_ref === 528) {
				b = appendUint(b, (sec >>> 0), 48);
			} else if (_ref === 531) {
				if (hour >= 12) {
					b = $appendSlice(b, new sliceType$3($stringToBytes("PM")));
				} else {
					b = $appendSlice(b, new sliceType$3($stringToBytes("AM")));
				}
			} else if (_ref === 532) {
				if (hour >= 12) {
					b = $appendSlice(b, new sliceType$3($stringToBytes("pm")));
				} else {
					b = $appendSlice(b, new sliceType$3($stringToBytes("am")));
				}
			} else if (_ref === 22 || _ref === 24 || _ref === 23 || _ref === 25 || _ref === 26 || _ref === 29 || _ref === 27 || _ref === 30) {
				if ((offset === 0) && ((std === 22) || (std === 24) || (std === 23) || (std === 25))) {
					b = $append(b, 90);
					break;
				}
				zone$1 = (_q = offset / 60, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero"));
				absoffset = offset;
				if (zone$1 < 0) {
					b = $append(b, 45);
					zone$1 = -zone$1;
					absoffset = -absoffset;
				} else {
					b = $append(b, 43);
				}
				b = appendUint(b, ((_q$1 = zone$1 / 60, (_q$1 === _q$1 && _q$1 !== 1/0 && _q$1 !== -1/0) ? _q$1 >> 0 : $throwRuntimeError("integer divide by zero")) >>> 0), 48);
				if ((std === 24) || (std === 29) || (std === 25) || (std === 30)) {
					b = $append(b, 58);
				}
				b = appendUint(b, ((_r$4 = zone$1 % 60, _r$4 === _r$4 ? _r$4 : $throwRuntimeError("integer divide by zero")) >>> 0), 48);
				if ((std === 23) || (std === 27) || (std === 30) || (std === 25)) {
					if ((std === 30) || (std === 25)) {
						b = $append(b, 58);
					}
					b = appendUint(b, ((_r$5 = absoffset % 60, _r$5 === _r$5 ? _r$5 : $throwRuntimeError("integer divide by zero")) >>> 0), 48);
				}
			} else if (_ref === 21) {
				if (!(name === "")) {
					b = $appendSlice(b, new sliceType$3($stringToBytes(name)));
					break;
				}
				zone$2 = (_q$2 = offset / 60, (_q$2 === _q$2 && _q$2 !== 1/0 && _q$2 !== -1/0) ? _q$2 >> 0 : $throwRuntimeError("integer divide by zero"));
				if (zone$2 < 0) {
					b = $append(b, 45);
					zone$2 = -zone$2;
				} else {
					b = $append(b, 43);
				}
				b = appendUint(b, ((_q$3 = zone$2 / 60, (_q$3 === _q$3 && _q$3 !== 1/0 && _q$3 !== -1/0) ? _q$3 >> 0 : $throwRuntimeError("integer divide by zero")) >>> 0), 48);
				b = appendUint(b, ((_r$6 = zone$2 % 60, _r$6 === _r$6 ? _r$6 : $throwRuntimeError("integer divide by zero")) >>> 0), 48);
			} else if (_ref === 31 || _ref === 32) {
				b = formatNano(b, (t.Nanosecond() >>> 0), std >> 16 >> 0, (std & 65535) === 32);
			} }
		}
		return $bytesToString(b);
	};
	Time.prototype.Format = function(layout) { return this.$val.Format(layout); };
	quote = function(s) {
		var s;
		return "\"" + s + "\"";
	};
	ParseError.ptr.prototype.Error = function() {
		var e;
		e = this;
		if (e.Message === "") {
			return "parsing time " + quote(e.Value) + " as " + quote(e.Layout) + ": cannot parse " + quote(e.ValueElem) + " as " + quote(e.LayoutElem);
		}
		return "parsing time " + quote(e.Value) + e.Message;
	};
	ParseError.prototype.Error = function() { return this.$val.Error(); };
	isDigit = function(s, i) {
		var c, i, s;
		if (s.length <= i) {
			return false;
		}
		c = s.charCodeAt(i);
		return 48 <= c && c <= 57;
	};
	getnum = function(s, fixed) {
		var fixed, s;
		if (!isDigit(s, 0)) {
			return [0, s, errBad];
		}
		if (!isDigit(s, 1)) {
			if (fixed) {
				return [0, s, errBad];
			}
			return [((s.charCodeAt(0) - 48 << 24 >>> 24) >> 0), s.substring(1), $ifaceNil];
		}
		return [(((s.charCodeAt(0) - 48 << 24 >>> 24) >> 0) * 10 >> 0) + ((s.charCodeAt(1) - 48 << 24 >>> 24) >> 0) >> 0, s.substring(2), $ifaceNil];
	};
	cutspace = function(s) {
		var s;
		while (true) {
			if (!(s.length > 0 && (s.charCodeAt(0) === 32))) { break; }
			s = s.substring(1);
		}
		return s;
	};
	skip = function(value, prefix) {
		var prefix, value;
		while (true) {
			if (!(prefix.length > 0)) { break; }
			if (prefix.charCodeAt(0) === 32) {
				if (value.length > 0 && !((value.charCodeAt(0) === 32))) {
					return [value, errBad];
				}
				prefix = cutspace(prefix);
				value = cutspace(value);
				continue;
			}
			if ((value.length === 0) || !((value.charCodeAt(0) === prefix.charCodeAt(0)))) {
				return [value, errBad];
			}
			prefix = prefix.substring(1);
			value = value.substring(1);
		}
		return [value, $ifaceNil];
	};
	Parse = $pkg.Parse = function(layout, value) {
		var layout, value;
		return parse(layout, value, $pkg.UTC, $pkg.Local);
	};
	parse = function(layout, value, defaultLocation, local) {
		var _ref, _ref$1, _ref$2, _ref$3, _tmp, _tmp$1, _tmp$10, _tmp$11, _tmp$12, _tmp$13, _tmp$14, _tmp$15, _tmp$16, _tmp$17, _tmp$18, _tmp$19, _tmp$2, _tmp$20, _tmp$21, _tmp$22, _tmp$23, _tmp$24, _tmp$25, _tmp$26, _tmp$27, _tmp$28, _tmp$29, _tmp$3, _tmp$30, _tmp$31, _tmp$32, _tmp$33, _tmp$34, _tmp$35, _tmp$36, _tmp$37, _tmp$38, _tmp$39, _tmp$4, _tmp$40, _tmp$41, _tmp$42, _tmp$43, _tmp$5, _tmp$6, _tmp$7, _tmp$8, _tmp$9, _tuple$1, _tuple$10, _tuple$11, _tuple$12, _tuple$13, _tuple$14, _tuple$15, _tuple$16, _tuple$17, _tuple$18, _tuple$19, _tuple$2, _tuple$20, _tuple$21, _tuple$22, _tuple$23, _tuple$24, _tuple$25, _tuple$3, _tuple$4, _tuple$5, _tuple$6, _tuple$7, _tuple$8, _tuple$9, alayout, amSet, avalue, day, defaultLocation, err, hour, hour$1, hr, i, layout, local, min, min$1, mm, month, n, n$1, name, ndigit, nsec, offset, offset$1, ok, ok$1, p, pmSet, prefix, rangeErrString, sec, seconds, sign, ss, std, stdstr, suffix, t, t$1, value, x, x$1, x$2, x$3, x$4, x$5, year, z, zoneName, zoneOffset;
		_tmp = layout; _tmp$1 = value; alayout = _tmp; avalue = _tmp$1;
		rangeErrString = "";
		amSet = false;
		pmSet = false;
		year = 0;
		month = 1;
		day = 1;
		hour = 0;
		min = 0;
		sec = 0;
		nsec = 0;
		z = ptrType$1.nil;
		zoneOffset = -1;
		zoneName = "";
		while (true) {
			if (!(true)) { break; }
			err = $ifaceNil;
			_tuple$1 = nextStdChunk(layout); prefix = _tuple$1[0]; std = _tuple$1[1]; suffix = _tuple$1[2];
			stdstr = layout.substring(prefix.length, (layout.length - suffix.length >> 0));
			_tuple$2 = skip(value, prefix); value = _tuple$2[0]; err = _tuple$2[1];
			if (!($interfaceIsEqual(err, $ifaceNil))) {
				return [new Time.ptr(new $Int64(0, 0), 0, ptrType$1.nil), new ParseError.ptr(alayout, avalue, prefix, value, "")];
			}
			if (std === 0) {
				if (!((value.length === 0))) {
					return [new Time.ptr(new $Int64(0, 0), 0, ptrType$1.nil), new ParseError.ptr(alayout, avalue, "", value, ": extra text: " + value)];
				}
				break;
			}
			layout = suffix;
			p = "";
			_ref = std & 65535;
			switch (0) { default: if (_ref === 274) {
				if (value.length < 2) {
					err = errBad;
					break;
				}
				_tmp$2 = value.substring(0, 2); _tmp$3 = value.substring(2); p = _tmp$2; value = _tmp$3;
				_tuple$3 = atoi(p); year = _tuple$3[0]; err = _tuple$3[1];
				if (year >= 69) {
					year = year + (1900) >> 0;
				} else {
					year = year + (2000) >> 0;
				}
			} else if (_ref === 273) {
				if (value.length < 4 || !isDigit(value, 0)) {
					err = errBad;
					break;
				}
				_tmp$4 = value.substring(0, 4); _tmp$5 = value.substring(4); p = _tmp$4; value = _tmp$5;
				_tuple$4 = atoi(p); year = _tuple$4[0]; err = _tuple$4[1];
			} else if (_ref === 258) {
				_tuple$5 = lookup(shortMonthNames, value); month = _tuple$5[0]; value = _tuple$5[1]; err = _tuple$5[2];
			} else if (_ref === 257) {
				_tuple$6 = lookup(longMonthNames, value); month = _tuple$6[0]; value = _tuple$6[1]; err = _tuple$6[2];
			} else if (_ref === 259 || _ref === 260) {
				_tuple$7 = getnum(value, std === 260); month = _tuple$7[0]; value = _tuple$7[1]; err = _tuple$7[2];
				if (month <= 0 || 12 < month) {
					rangeErrString = "month";
				}
			} else if (_ref === 262) {
				_tuple$8 = lookup(shortDayNames, value); value = _tuple$8[1]; err = _tuple$8[2];
			} else if (_ref === 261) {
				_tuple$9 = lookup(longDayNames, value); value = _tuple$9[1]; err = _tuple$9[2];
			} else if (_ref === 263 || _ref === 264 || _ref === 265) {
				if ((std === 264) && value.length > 0 && (value.charCodeAt(0) === 32)) {
					value = value.substring(1);
				}
				_tuple$10 = getnum(value, std === 265); day = _tuple$10[0]; value = _tuple$10[1]; err = _tuple$10[2];
				if (day < 0 || 31 < day) {
					rangeErrString = "day";
				}
			} else if (_ref === 522) {
				_tuple$11 = getnum(value, false); hour = _tuple$11[0]; value = _tuple$11[1]; err = _tuple$11[2];
				if (hour < 0 || 24 <= hour) {
					rangeErrString = "hour";
				}
			} else if (_ref === 523 || _ref === 524) {
				_tuple$12 = getnum(value, std === 524); hour = _tuple$12[0]; value = _tuple$12[1]; err = _tuple$12[2];
				if (hour < 0 || 12 < hour) {
					rangeErrString = "hour";
				}
			} else if (_ref === 525 || _ref === 526) {
				_tuple$13 = getnum(value, std === 526); min = _tuple$13[0]; value = _tuple$13[1]; err = _tuple$13[2];
				if (min < 0 || 60 <= min) {
					rangeErrString = "minute";
				}
			} else if (_ref === 527 || _ref === 528) {
				_tuple$14 = getnum(value, std === 528); sec = _tuple$14[0]; value = _tuple$14[1]; err = _tuple$14[2];
				if (sec < 0 || 60 <= sec) {
					rangeErrString = "second";
				}
				if (value.length >= 2 && (value.charCodeAt(0) === 46) && isDigit(value, 1)) {
					_tuple$15 = nextStdChunk(layout); std = _tuple$15[1];
					std = std & (65535);
					if ((std === 31) || (std === 32)) {
						break;
					}
					n = 2;
					while (true) {
						if (!(n < value.length && isDigit(value, n))) { break; }
						n = n + (1) >> 0;
					}
					_tuple$16 = parseNanoseconds(value, n); nsec = _tuple$16[0]; rangeErrString = _tuple$16[1]; err = _tuple$16[2];
					value = value.substring(n);
				}
			} else if (_ref === 531) {
				if (value.length < 2) {
					err = errBad;
					break;
				}
				_tmp$6 = value.substring(0, 2); _tmp$7 = value.substring(2); p = _tmp$6; value = _tmp$7;
				_ref$1 = p;
				if (_ref$1 === "PM") {
					pmSet = true;
				} else if (_ref$1 === "AM") {
					amSet = true;
				} else {
					err = errBad;
				}
			} else if (_ref === 532) {
				if (value.length < 2) {
					err = errBad;
					break;
				}
				_tmp$8 = value.substring(0, 2); _tmp$9 = value.substring(2); p = _tmp$8; value = _tmp$9;
				_ref$2 = p;
				if (_ref$2 === "pm") {
					pmSet = true;
				} else if (_ref$2 === "am") {
					amSet = true;
				} else {
					err = errBad;
				}
			} else if (_ref === 22 || _ref === 24 || _ref === 23 || _ref === 25 || _ref === 26 || _ref === 28 || _ref === 29 || _ref === 27 || _ref === 30) {
				if (((std === 22) || (std === 24)) && value.length >= 1 && (value.charCodeAt(0) === 90)) {
					value = value.substring(1);
					z = $pkg.UTC;
					break;
				}
				_tmp$10 = ""; _tmp$11 = ""; _tmp$12 = ""; _tmp$13 = ""; sign = _tmp$10; hour$1 = _tmp$11; min$1 = _tmp$12; seconds = _tmp$13;
				if ((std === 24) || (std === 29)) {
					if (value.length < 6) {
						err = errBad;
						break;
					}
					if (!((value.charCodeAt(3) === 58))) {
						err = errBad;
						break;
					}
					_tmp$14 = value.substring(0, 1); _tmp$15 = value.substring(1, 3); _tmp$16 = value.substring(4, 6); _tmp$17 = "00"; _tmp$18 = value.substring(6); sign = _tmp$14; hour$1 = _tmp$15; min$1 = _tmp$16; seconds = _tmp$17; value = _tmp$18;
				} else if (std === 28) {
					if (value.length < 3) {
						err = errBad;
						break;
					}
					_tmp$19 = value.substring(0, 1); _tmp$20 = value.substring(1, 3); _tmp$21 = "00"; _tmp$22 = "00"; _tmp$23 = value.substring(3); sign = _tmp$19; hour$1 = _tmp$20; min$1 = _tmp$21; seconds = _tmp$22; value = _tmp$23;
				} else if ((std === 25) || (std === 30)) {
					if (value.length < 9) {
						err = errBad;
						break;
					}
					if (!((value.charCodeAt(3) === 58)) || !((value.charCodeAt(6) === 58))) {
						err = errBad;
						break;
					}
					_tmp$24 = value.substring(0, 1); _tmp$25 = value.substring(1, 3); _tmp$26 = value.substring(4, 6); _tmp$27 = value.substring(7, 9); _tmp$28 = value.substring(9); sign = _tmp$24; hour$1 = _tmp$25; min$1 = _tmp$26; seconds = _tmp$27; value = _tmp$28;
				} else if ((std === 23) || (std === 27)) {
					if (value.length < 7) {
						err = errBad;
						break;
					}
					_tmp$29 = value.substring(0, 1); _tmp$30 = value.substring(1, 3); _tmp$31 = value.substring(3, 5); _tmp$32 = value.substring(5, 7); _tmp$33 = value.substring(7); sign = _tmp$29; hour$1 = _tmp$30; min$1 = _tmp$31; seconds = _tmp$32; value = _tmp$33;
				} else {
					if (value.length < 5) {
						err = errBad;
						break;
					}
					_tmp$34 = value.substring(0, 1); _tmp$35 = value.substring(1, 3); _tmp$36 = value.substring(3, 5); _tmp$37 = "00"; _tmp$38 = value.substring(5); sign = _tmp$34; hour$1 = _tmp$35; min$1 = _tmp$36; seconds = _tmp$37; value = _tmp$38;
				}
				_tmp$39 = 0; _tmp$40 = 0; _tmp$41 = 0; hr = _tmp$39; mm = _tmp$40; ss = _tmp$41;
				_tuple$17 = atoi(hour$1); hr = _tuple$17[0]; err = _tuple$17[1];
				if ($interfaceIsEqual(err, $ifaceNil)) {
					_tuple$18 = atoi(min$1); mm = _tuple$18[0]; err = _tuple$18[1];
				}
				if ($interfaceIsEqual(err, $ifaceNil)) {
					_tuple$19 = atoi(seconds); ss = _tuple$19[0]; err = _tuple$19[1];
				}
				zoneOffset = ((((hr * 60 >> 0) + mm >> 0)) * 60 >> 0) + ss >> 0;
				_ref$3 = sign.charCodeAt(0);
				if (_ref$3 === 43) {
				} else if (_ref$3 === 45) {
					zoneOffset = -zoneOffset;
				} else {
					err = errBad;
				}
			} else if (_ref === 21) {
				if (value.length >= 3 && value.substring(0, 3) === "UTC") {
					z = $pkg.UTC;
					value = value.substring(3);
					break;
				}
				_tuple$20 = parseTimeZone(value); n$1 = _tuple$20[0]; ok = _tuple$20[1];
				if (!ok) {
					err = errBad;
					break;
				}
				_tmp$42 = value.substring(0, n$1); _tmp$43 = value.substring(n$1); zoneName = _tmp$42; value = _tmp$43;
			} else if (_ref === 31) {
				ndigit = 1 + ((std >> 16 >> 0)) >> 0;
				if (value.length < ndigit) {
					err = errBad;
					break;
				}
				_tuple$21 = parseNanoseconds(value, ndigit); nsec = _tuple$21[0]; rangeErrString = _tuple$21[1]; err = _tuple$21[2];
				value = value.substring(ndigit);
			} else if (_ref === 32) {
				if (value.length < 2 || !((value.charCodeAt(0) === 46)) || value.charCodeAt(1) < 48 || 57 < value.charCodeAt(1)) {
					break;
				}
				i = 0;
				while (true) {
					if (!(i < 9 && (i + 1 >> 0) < value.length && 48 <= value.charCodeAt((i + 1 >> 0)) && value.charCodeAt((i + 1 >> 0)) <= 57)) { break; }
					i = i + (1) >> 0;
				}
				_tuple$22 = parseNanoseconds(value, 1 + i >> 0); nsec = _tuple$22[0]; rangeErrString = _tuple$22[1]; err = _tuple$22[2];
				value = value.substring((1 + i >> 0));
			} }
			if (!(rangeErrString === "")) {
				return [new Time.ptr(new $Int64(0, 0), 0, ptrType$1.nil), new ParseError.ptr(alayout, avalue, stdstr, value, ": " + rangeErrString + " out of range")];
			}
			if (!($interfaceIsEqual(err, $ifaceNil))) {
				return [new Time.ptr(new $Int64(0, 0), 0, ptrType$1.nil), new ParseError.ptr(alayout, avalue, stdstr, value, "")];
			}
		}
		if (pmSet && hour < 12) {
			hour = hour + (12) >> 0;
		} else if (amSet && (hour === 12)) {
			hour = 0;
		}
		if (!(z === ptrType$1.nil)) {
			return [Date(year, (month >> 0), day, hour, min, sec, nsec, z), $ifaceNil];
		}
		if (!((zoneOffset === -1))) {
			t = $clone(Date(year, (month >> 0), day, hour, min, sec, nsec, $pkg.UTC), Time);
			t.sec = (x = t.sec, x$1 = new $Int64(0, zoneOffset), new $Int64(x.$high - x$1.$high, x.$low - x$1.$low));
			_tuple$23 = local.lookup((x$2 = t.sec, new $Int64(x$2.$high + -15, x$2.$low + 2288912640))); name = _tuple$23[0]; offset = _tuple$23[1];
			if ((offset === zoneOffset) && (zoneName === "" || name === zoneName)) {
				t.loc = local;
				return [t, $ifaceNil];
			}
			t.loc = FixedZone(zoneName, zoneOffset);
			return [t, $ifaceNil];
		}
		if (!(zoneName === "")) {
			t$1 = $clone(Date(year, (month >> 0), day, hour, min, sec, nsec, $pkg.UTC), Time);
			_tuple$24 = local.lookupName(zoneName, (x$3 = t$1.sec, new $Int64(x$3.$high + -15, x$3.$low + 2288912640))); offset$1 = _tuple$24[0]; ok$1 = _tuple$24[2];
			if (ok$1) {
				t$1.sec = (x$4 = t$1.sec, x$5 = new $Int64(0, offset$1), new $Int64(x$4.$high - x$5.$high, x$4.$low - x$5.$low));
				t$1.loc = local;
				return [t$1, $ifaceNil];
			}
			if (zoneName.length > 3 && zoneName.substring(0, 3) === "GMT") {
				_tuple$25 = atoi(zoneName.substring(3)); offset$1 = _tuple$25[0];
				offset$1 = offset$1 * (3600) >> 0;
			}
			t$1.loc = FixedZone(zoneName, offset$1);
			return [t$1, $ifaceNil];
		}
		return [Date(year, (month >> 0), day, hour, min, sec, nsec, defaultLocation), $ifaceNil];
	};
	parseTimeZone = function(value) {
		var _ref, _tmp, _tmp$1, _tmp$10, _tmp$11, _tmp$12, _tmp$13, _tmp$14, _tmp$15, _tmp$2, _tmp$3, _tmp$4, _tmp$5, _tmp$6, _tmp$7, _tmp$8, _tmp$9, c, length = 0, nUpper, ok = false, value;
		if (value.length < 3) {
			_tmp = 0; _tmp$1 = false; length = _tmp; ok = _tmp$1;
			return [length, ok];
		}
		if (value.length >= 4 && (value.substring(0, 4) === "ChST" || value.substring(0, 4) === "MeST")) {
			_tmp$2 = 4; _tmp$3 = true; length = _tmp$2; ok = _tmp$3;
			return [length, ok];
		}
		if (value.substring(0, 3) === "GMT") {
			length = parseGMT(value);
			_tmp$4 = length; _tmp$5 = true; length = _tmp$4; ok = _tmp$5;
			return [length, ok];
		}
		nUpper = 0;
		nUpper = 0;
		while (true) {
			if (!(nUpper < 6)) { break; }
			if (nUpper >= value.length) {
				break;
			}
			c = value.charCodeAt(nUpper);
			if (c < 65 || 90 < c) {
				break;
			}
			nUpper = nUpper + (1) >> 0;
		}
		_ref = nUpper;
		if (_ref === 0 || _ref === 1 || _ref === 2 || _ref === 6) {
			_tmp$6 = 0; _tmp$7 = false; length = _tmp$6; ok = _tmp$7;
			return [length, ok];
		} else if (_ref === 5) {
			if (value.charCodeAt(4) === 84) {
				_tmp$8 = 5; _tmp$9 = true; length = _tmp$8; ok = _tmp$9;
				return [length, ok];
			}
		} else if (_ref === 4) {
			if (value.charCodeAt(3) === 84) {
				_tmp$10 = 4; _tmp$11 = true; length = _tmp$10; ok = _tmp$11;
				return [length, ok];
			}
		} else if (_ref === 3) {
			_tmp$12 = 3; _tmp$13 = true; length = _tmp$12; ok = _tmp$13;
			return [length, ok];
		}
		_tmp$14 = 0; _tmp$15 = false; length = _tmp$14; ok = _tmp$15;
		return [length, ok];
	};
	parseGMT = function(value) {
		var _tuple$1, err, rem, sign, value, x;
		value = value.substring(3);
		if (value.length === 0) {
			return 3;
		}
		sign = value.charCodeAt(0);
		if (!((sign === 45)) && !((sign === 43))) {
			return 3;
		}
		_tuple$1 = leadingInt(value.substring(1)); x = _tuple$1[0]; rem = _tuple$1[1]; err = _tuple$1[2];
		if (!($interfaceIsEqual(err, $ifaceNil))) {
			return 3;
		}
		if (sign === 45) {
			x = new $Int64(-x.$high, -x.$low);
		}
		if ((x.$high === 0 && x.$low === 0) || (x.$high < -1 || (x.$high === -1 && x.$low < 4294967282)) || (0 < x.$high || (0 === x.$high && 12 < x.$low))) {
			return 3;
		}
		return (3 + value.length >> 0) - rem.length >> 0;
	};
	parseNanoseconds = function(value, nbytes) {
		var _tuple$1, err = $ifaceNil, i, nbytes, ns = 0, rangeErrString = "", scaleDigits, value;
		if (!((value.charCodeAt(0) === 46))) {
			err = errBad;
			return [ns, rangeErrString, err];
		}
		_tuple$1 = atoi(value.substring(1, nbytes)); ns = _tuple$1[0]; err = _tuple$1[1];
		if (!($interfaceIsEqual(err, $ifaceNil))) {
			return [ns, rangeErrString, err];
		}
		if (ns < 0 || 1000000000 <= ns) {
			rangeErrString = "fractional second";
			return [ns, rangeErrString, err];
		}
		scaleDigits = 10 - nbytes >> 0;
		i = 0;
		while (true) {
			if (!(i < scaleDigits)) { break; }
			ns = ns * (10) >> 0;
			i = i + (1) >> 0;
		}
		return [ns, rangeErrString, err];
	};
	leadingInt = function(s) {
		var _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, c, err = $ifaceNil, i, rem = "", s, x = new $Int64(0, 0), x$1, x$2, x$3;
		i = 0;
		while (true) {
			if (!(i < s.length)) { break; }
			c = s.charCodeAt(i);
			if (c < 48 || c > 57) {
				break;
			}
			if ((x.$high > 214748364 || (x.$high === 214748364 && x.$low >= 3435973835))) {
				_tmp = new $Int64(0, 0); _tmp$1 = ""; _tmp$2 = errLeadingInt; x = _tmp; rem = _tmp$1; err = _tmp$2;
				return [x, rem, err];
			}
			x = (x$1 = (x$2 = $mul64(x, new $Int64(0, 10)), x$3 = new $Int64(0, c), new $Int64(x$2.$high + x$3.$high, x$2.$low + x$3.$low)), new $Int64(x$1.$high - 0, x$1.$low - 48));
			i = i + (1) >> 0;
		}
		_tmp$3 = x; _tmp$4 = s.substring(i); _tmp$5 = $ifaceNil; x = _tmp$3; rem = _tmp$4; err = _tmp$5;
		return [x, rem, err];
	};
	Time.ptr.prototype.After = function(u) {
		var t, u, x, x$1, x$2, x$3;
		t = $clone(this, Time);
		u = $clone(u, Time);
		return (x = t.sec, x$1 = u.sec, (x.$high > x$1.$high || (x.$high === x$1.$high && x.$low > x$1.$low))) || (x$2 = t.sec, x$3 = u.sec, (x$2.$high === x$3.$high && x$2.$low === x$3.$low)) && t.nsec > u.nsec;
	};
	Time.prototype.After = function(u) { return this.$val.After(u); };
	Time.ptr.prototype.Before = function(u) {
		var t, u, x, x$1, x$2, x$3;
		t = $clone(this, Time);
		u = $clone(u, Time);
		return (x = t.sec, x$1 = u.sec, (x.$high < x$1.$high || (x.$high === x$1.$high && x.$low < x$1.$low))) || (x$2 = t.sec, x$3 = u.sec, (x$2.$high === x$3.$high && x$2.$low === x$3.$low)) && t.nsec < u.nsec;
	};
	Time.prototype.Before = function(u) { return this.$val.Before(u); };
	Time.ptr.prototype.Equal = function(u) {
		var t, u, x, x$1;
		t = $clone(this, Time);
		u = $clone(u, Time);
		return (x = t.sec, x$1 = u.sec, (x.$high === x$1.$high && x.$low === x$1.$low)) && (t.nsec === u.nsec);
	};
	Time.prototype.Equal = function(u) { return this.$val.Equal(u); };
	Month.prototype.String = function() {
		var m, x;
		m = this.$val;
		return (x = m - 1 >> 0, ((x < 0 || x >= months.length) ? $throwRuntimeError("index out of range") : months[x]));
	};
	$ptrType(Month).prototype.String = function() { return new Month(this.$get()).String(); };
	Weekday.prototype.String = function() {
		var d;
		d = this.$val;
		return ((d < 0 || d >= days.length) ? $throwRuntimeError("index out of range") : days[d]);
	};
	$ptrType(Weekday).prototype.String = function() { return new Weekday(this.$get()).String(); };
	Time.ptr.prototype.IsZero = function() {
		var t, x;
		t = $clone(this, Time);
		return (x = t.sec, (x.$high === 0 && x.$low === 0)) && (t.nsec === 0);
	};
	Time.prototype.IsZero = function() { return this.$val.IsZero(); };
	Time.ptr.prototype.abs = function() {
		var _tuple$1, l, offset, sec, t, x, x$1, x$2, x$3, x$4, x$5;
		t = $clone(this, Time);
		l = t.loc;
		if (l === ptrType$1.nil || l === localLoc) {
			l = l.get();
		}
		sec = (x = t.sec, new $Int64(x.$high + -15, x.$low + 2288912640));
		if (!(l === utcLoc)) {
			if (!(l.cacheZone === ptrType.nil) && (x$1 = l.cacheStart, (x$1.$high < sec.$high || (x$1.$high === sec.$high && x$1.$low <= sec.$low))) && (x$2 = l.cacheEnd, (sec.$high < x$2.$high || (sec.$high === x$2.$high && sec.$low < x$2.$low)))) {
				sec = (x$3 = new $Int64(0, l.cacheZone.offset), new $Int64(sec.$high + x$3.$high, sec.$low + x$3.$low));
			} else {
				_tuple$1 = l.lookup(sec); offset = _tuple$1[1];
				sec = (x$4 = new $Int64(0, offset), new $Int64(sec.$high + x$4.$high, sec.$low + x$4.$low));
			}
		}
		return (x$5 = new $Int64(sec.$high + 2147483646, sec.$low + 450480384), new $Uint64(x$5.$high, x$5.$low));
	};
	Time.prototype.abs = function() { return this.$val.abs(); };
	Time.ptr.prototype.locabs = function() {
		var _tuple$1, abs = new $Uint64(0, 0), l, name = "", offset = 0, sec, t, x, x$1, x$2, x$3, x$4;
		t = $clone(this, Time);
		l = t.loc;
		if (l === ptrType$1.nil || l === localLoc) {
			l = l.get();
		}
		sec = (x = t.sec, new $Int64(x.$high + -15, x.$low + 2288912640));
		if (!(l === utcLoc)) {
			if (!(l.cacheZone === ptrType.nil) && (x$1 = l.cacheStart, (x$1.$high < sec.$high || (x$1.$high === sec.$high && x$1.$low <= sec.$low))) && (x$2 = l.cacheEnd, (sec.$high < x$2.$high || (sec.$high === x$2.$high && sec.$low < x$2.$low)))) {
				name = l.cacheZone.name;
				offset = l.cacheZone.offset;
			} else {
				_tuple$1 = l.lookup(sec); name = _tuple$1[0]; offset = _tuple$1[1];
			}
			sec = (x$3 = new $Int64(0, offset), new $Int64(sec.$high + x$3.$high, sec.$low + x$3.$low));
		} else {
			name = "UTC";
		}
		abs = (x$4 = new $Int64(sec.$high + 2147483646, sec.$low + 450480384), new $Uint64(x$4.$high, x$4.$low));
		return [name, offset, abs];
	};
	Time.prototype.locabs = function() { return this.$val.locabs(); };
	Time.ptr.prototype.Date = function() {
		var _tuple$1, day = 0, month = 0, t, year = 0;
		t = $clone(this, Time);
		_tuple$1 = t.date(true); year = _tuple$1[0]; month = _tuple$1[1]; day = _tuple$1[2];
		return [year, month, day];
	};
	Time.prototype.Date = function() { return this.$val.Date(); };
	Time.ptr.prototype.Year = function() {
		var _tuple$1, t, year;
		t = $clone(this, Time);
		_tuple$1 = t.date(false); year = _tuple$1[0];
		return year;
	};
	Time.prototype.Year = function() { return this.$val.Year(); };
	Time.ptr.prototype.Month = function() {
		var _tuple$1, month, t;
		t = $clone(this, Time);
		_tuple$1 = t.date(true); month = _tuple$1[1];
		return month;
	};
	Time.prototype.Month = function() { return this.$val.Month(); };
	Time.ptr.prototype.Day = function() {
		var _tuple$1, day, t;
		t = $clone(this, Time);
		_tuple$1 = t.date(true); day = _tuple$1[2];
		return day;
	};
	Time.prototype.Day = function() { return this.$val.Day(); };
	Time.ptr.prototype.Weekday = function() {
		var t;
		t = $clone(this, Time);
		return absWeekday(t.abs());
	};
	Time.prototype.Weekday = function() { return this.$val.Weekday(); };
	absWeekday = function(abs) {
		var _q, abs, sec;
		sec = $div64((new $Uint64(abs.$high + 0, abs.$low + 86400)), new $Uint64(0, 604800), true);
		return ((_q = (sec.$low >> 0) / 86400, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero")) >> 0);
	};
	Time.ptr.prototype.ISOWeek = function() {
		var _q, _r$1, _r$2, _r$3, _tuple$1, day, dec31wday, jan1wday, month, t, wday, week = 0, yday, year = 0;
		t = $clone(this, Time);
		_tuple$1 = t.date(true); year = _tuple$1[0]; month = _tuple$1[1]; day = _tuple$1[2]; yday = _tuple$1[3];
		wday = (_r$1 = ((t.Weekday() + 6 >> 0) >> 0) % 7, _r$1 === _r$1 ? _r$1 : $throwRuntimeError("integer divide by zero"));
		week = (_q = (((yday - wday >> 0) + 7 >> 0)) / 7, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero"));
		jan1wday = (_r$2 = (((wday - yday >> 0) + 371 >> 0)) % 7, _r$2 === _r$2 ? _r$2 : $throwRuntimeError("integer divide by zero"));
		if (1 <= jan1wday && jan1wday <= 3) {
			week = week + (1) >> 0;
		}
		if (week === 0) {
			year = year - (1) >> 0;
			week = 52;
			if ((jan1wday === 4) || ((jan1wday === 5) && isLeap(year))) {
				week = week + (1) >> 0;
			}
		}
		if ((month === 12) && day >= 29 && wday < 3) {
			dec31wday = (_r$3 = (((wday + 31 >> 0) - day >> 0)) % 7, _r$3 === _r$3 ? _r$3 : $throwRuntimeError("integer divide by zero"));
			if (0 <= dec31wday && dec31wday <= 2) {
				year = year + (1) >> 0;
				week = 1;
			}
		}
		return [year, week];
	};
	Time.prototype.ISOWeek = function() { return this.$val.ISOWeek(); };
	Time.ptr.prototype.Clock = function() {
		var _tuple$1, hour = 0, min = 0, sec = 0, t;
		t = $clone(this, Time);
		_tuple$1 = absClock(t.abs()); hour = _tuple$1[0]; min = _tuple$1[1]; sec = _tuple$1[2];
		return [hour, min, sec];
	};
	Time.prototype.Clock = function() { return this.$val.Clock(); };
	absClock = function(abs) {
		var _q, _q$1, abs, hour = 0, min = 0, sec = 0;
		sec = ($div64(abs, new $Uint64(0, 86400), true).$low >> 0);
		hour = (_q = sec / 3600, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero"));
		sec = sec - ((hour * 3600 >> 0)) >> 0;
		min = (_q$1 = sec / 60, (_q$1 === _q$1 && _q$1 !== 1/0 && _q$1 !== -1/0) ? _q$1 >> 0 : $throwRuntimeError("integer divide by zero"));
		sec = sec - ((min * 60 >> 0)) >> 0;
		return [hour, min, sec];
	};
	Time.ptr.prototype.Hour = function() {
		var _q, t;
		t = $clone(this, Time);
		return (_q = ($div64(t.abs(), new $Uint64(0, 86400), true).$low >> 0) / 3600, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero"));
	};
	Time.prototype.Hour = function() { return this.$val.Hour(); };
	Time.ptr.prototype.Minute = function() {
		var _q, t;
		t = $clone(this, Time);
		return (_q = ($div64(t.abs(), new $Uint64(0, 3600), true).$low >> 0) / 60, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero"));
	};
	Time.prototype.Minute = function() { return this.$val.Minute(); };
	Time.ptr.prototype.Second = function() {
		var t;
		t = $clone(this, Time);
		return ($div64(t.abs(), new $Uint64(0, 60), true).$low >> 0);
	};
	Time.prototype.Second = function() { return this.$val.Second(); };
	Time.ptr.prototype.Nanosecond = function() {
		var t;
		t = $clone(this, Time);
		return (t.nsec >> 0);
	};
	Time.prototype.Nanosecond = function() { return this.$val.Nanosecond(); };
	Time.ptr.prototype.YearDay = function() {
		var _tuple$1, t, yday;
		t = $clone(this, Time);
		_tuple$1 = t.date(false); yday = _tuple$1[3];
		return yday + 1 >> 0;
	};
	Time.prototype.YearDay = function() { return this.$val.YearDay(); };
	Duration.prototype.String = function() {
		var _tuple$1, _tuple$2, buf, d, neg, prec, u, w;
		d = this;
		buf = $clone(arrayType.zero(), arrayType);
		w = 32;
		u = new $Uint64(d.$high, d.$low);
		neg = (d.$high < 0 || (d.$high === 0 && d.$low < 0));
		if (neg) {
			u = new $Uint64(-u.$high, -u.$low);
		}
		if ((u.$high < 0 || (u.$high === 0 && u.$low < 1000000000))) {
			prec = 0;
			w = w - (1) >> 0;
			(w < 0 || w >= buf.length) ? $throwRuntimeError("index out of range") : buf[w] = 115;
			w = w - (1) >> 0;
			if ((u.$high === 0 && u.$low === 0)) {
				return "0";
			} else if ((u.$high < 0 || (u.$high === 0 && u.$low < 1000))) {
				prec = 0;
				(w < 0 || w >= buf.length) ? $throwRuntimeError("index out of range") : buf[w] = 110;
			} else if ((u.$high < 0 || (u.$high === 0 && u.$low < 1000000))) {
				prec = 3;
				w = w - (1) >> 0;
				$copyString($subslice(new sliceType$3(buf), w), "\xC2\xB5");
			} else {
				prec = 6;
				(w < 0 || w >= buf.length) ? $throwRuntimeError("index out of range") : buf[w] = 109;
			}
			_tuple$1 = fmtFrac($subslice(new sliceType$3(buf), 0, w), u, prec); w = _tuple$1[0]; u = _tuple$1[1];
			w = fmtInt($subslice(new sliceType$3(buf), 0, w), u);
		} else {
			w = w - (1) >> 0;
			(w < 0 || w >= buf.length) ? $throwRuntimeError("index out of range") : buf[w] = 115;
			_tuple$2 = fmtFrac($subslice(new sliceType$3(buf), 0, w), u, 9); w = _tuple$2[0]; u = _tuple$2[1];
			w = fmtInt($subslice(new sliceType$3(buf), 0, w), $div64(u, new $Uint64(0, 60), true));
			u = $div64(u, (new $Uint64(0, 60)), false);
			if ((u.$high > 0 || (u.$high === 0 && u.$low > 0))) {
				w = w - (1) >> 0;
				(w < 0 || w >= buf.length) ? $throwRuntimeError("index out of range") : buf[w] = 109;
				w = fmtInt($subslice(new sliceType$3(buf), 0, w), $div64(u, new $Uint64(0, 60), true));
				u = $div64(u, (new $Uint64(0, 60)), false);
				if ((u.$high > 0 || (u.$high === 0 && u.$low > 0))) {
					w = w - (1) >> 0;
					(w < 0 || w >= buf.length) ? $throwRuntimeError("index out of range") : buf[w] = 104;
					w = fmtInt($subslice(new sliceType$3(buf), 0, w), u);
				}
			}
		}
		if (neg) {
			w = w - (1) >> 0;
			(w < 0 || w >= buf.length) ? $throwRuntimeError("index out of range") : buf[w] = 45;
		}
		return $bytesToString($subslice(new sliceType$3(buf), w));
	};
	$ptrType(Duration).prototype.String = function() { return this.$get().String(); };
	fmtFrac = function(buf, v, prec) {
		var _tmp, _tmp$1, buf, digit, i, nv = new $Uint64(0, 0), nw = 0, prec, print, v, w;
		w = buf.$length;
		print = false;
		i = 0;
		while (true) {
			if (!(i < prec)) { break; }
			digit = $div64(v, new $Uint64(0, 10), true);
			print = print || !((digit.$high === 0 && digit.$low === 0));
			if (print) {
				w = w - (1) >> 0;
				(w < 0 || w >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + w] = (digit.$low << 24 >>> 24) + 48 << 24 >>> 24;
			}
			v = $div64(v, (new $Uint64(0, 10)), false);
			i = i + (1) >> 0;
		}
		if (print) {
			w = w - (1) >> 0;
			(w < 0 || w >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + w] = 46;
		}
		_tmp = w; _tmp$1 = v; nw = _tmp; nv = _tmp$1;
		return [nw, nv];
	};
	fmtInt = function(buf, v) {
		var buf, v, w;
		w = buf.$length;
		if ((v.$high === 0 && v.$low === 0)) {
			w = w - (1) >> 0;
			(w < 0 || w >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + w] = 48;
		} else {
			while (true) {
				if (!((v.$high > 0 || (v.$high === 0 && v.$low > 0)))) { break; }
				w = w - (1) >> 0;
				(w < 0 || w >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + w] = ($div64(v, new $Uint64(0, 10), true).$low << 24 >>> 24) + 48 << 24 >>> 24;
				v = $div64(v, (new $Uint64(0, 10)), false);
			}
		}
		return w;
	};
	Duration.prototype.Nanoseconds = function() {
		var d;
		d = this;
		return new $Int64(d.$high, d.$low);
	};
	$ptrType(Duration).prototype.Nanoseconds = function() { return this.$get().Nanoseconds(); };
	Duration.prototype.Seconds = function() {
		var d, nsec, sec;
		d = this;
		sec = $div64(d, new Duration(0, 1000000000), false);
		nsec = $div64(d, new Duration(0, 1000000000), true);
		return $flatten64(sec) + $flatten64(nsec) * 1e-09;
	};
	$ptrType(Duration).prototype.Seconds = function() { return this.$get().Seconds(); };
	Duration.prototype.Minutes = function() {
		var d, min, nsec;
		d = this;
		min = $div64(d, new Duration(13, 4165425152), false);
		nsec = $div64(d, new Duration(13, 4165425152), true);
		return $flatten64(min) + $flatten64(nsec) * 1.6666666666666667e-11;
	};
	$ptrType(Duration).prototype.Minutes = function() { return this.$get().Minutes(); };
	Duration.prototype.Hours = function() {
		var d, hour, nsec;
		d = this;
		hour = $div64(d, new Duration(838, 817405952), false);
		nsec = $div64(d, new Duration(838, 817405952), true);
		return $flatten64(hour) + $flatten64(nsec) * 2.777777777777778e-13;
	};
	$ptrType(Duration).prototype.Hours = function() { return this.$get().Hours(); };
	Time.ptr.prototype.Add = function(d) {
		var d, nsec, t, x, x$1, x$2, x$3, x$4, x$5, x$6, x$7;
		t = $clone(this, Time);
		t.sec = (x = t.sec, x$1 = (x$2 = $div64(d, new Duration(0, 1000000000), false), new $Int64(x$2.$high, x$2.$low)), new $Int64(x.$high + x$1.$high, x.$low + x$1.$low));
		nsec = t.nsec + ((x$3 = $div64(d, new Duration(0, 1000000000), true), x$3.$low + ((x$3.$high >> 31) * 4294967296)) >> 0) >> 0;
		if (nsec >= 1000000000) {
			t.sec = (x$4 = t.sec, x$5 = new $Int64(0, 1), new $Int64(x$4.$high + x$5.$high, x$4.$low + x$5.$low));
			nsec = nsec - (1000000000) >> 0;
		} else if (nsec < 0) {
			t.sec = (x$6 = t.sec, x$7 = new $Int64(0, 1), new $Int64(x$6.$high - x$7.$high, x$6.$low - x$7.$low));
			nsec = nsec + (1000000000) >> 0;
		}
		t.nsec = nsec;
		return t;
	};
	Time.prototype.Add = function(d) { return this.$val.Add(d); };
	Time.ptr.prototype.Sub = function(u) {
		var d, t, u, x, x$1, x$2, x$3, x$4;
		t = $clone(this, Time);
		u = $clone(u, Time);
		d = (x = $mul64((x$1 = (x$2 = t.sec, x$3 = u.sec, new $Int64(x$2.$high - x$3.$high, x$2.$low - x$3.$low)), new Duration(x$1.$high, x$1.$low)), new Duration(0, 1000000000)), x$4 = new Duration(0, (t.nsec - u.nsec >> 0)), new Duration(x.$high + x$4.$high, x.$low + x$4.$low));
		if (u.Add(d).Equal(t)) {
			return d;
		} else if (t.Before(u)) {
			return new Duration(-2147483648, 0);
		} else {
			return new Duration(2147483647, 4294967295);
		}
	};
	Time.prototype.Sub = function(u) { return this.$val.Sub(u); };
	Time.ptr.prototype.AddDate = function(years, months$1, days$1) {
		var _tuple$1, _tuple$2, day, days$1, hour, min, month, months$1, sec, t, year, years;
		t = $clone(this, Time);
		_tuple$1 = t.Date(); year = _tuple$1[0]; month = _tuple$1[1]; day = _tuple$1[2];
		_tuple$2 = t.Clock(); hour = _tuple$2[0]; min = _tuple$2[1]; sec = _tuple$2[2];
		return Date(year + years >> 0, month + (months$1 >> 0) >> 0, day + days$1 >> 0, hour, min, sec, (t.nsec >> 0), t.loc);
	};
	Time.prototype.AddDate = function(years, months$1, days$1) { return this.$val.AddDate(years, months$1, days$1); };
	Time.ptr.prototype.date = function(full) {
		var _tuple$1, day = 0, full, month = 0, t, yday = 0, year = 0;
		t = $clone(this, Time);
		_tuple$1 = absDate(t.abs(), full); year = _tuple$1[0]; month = _tuple$1[1]; day = _tuple$1[2]; yday = _tuple$1[3];
		return [year, month, day, yday];
	};
	Time.prototype.date = function(full) { return this.$val.date(full); };
	absDate = function(abs, full) {
		var _q, abs, begin, d, day = 0, end, full, month = 0, n, x, x$1, x$10, x$11, x$2, x$3, x$4, x$5, x$6, x$7, x$8, x$9, y, yday = 0, year = 0;
		d = $div64(abs, new $Uint64(0, 86400), false);
		n = $div64(d, new $Uint64(0, 146097), false);
		y = $mul64(new $Uint64(0, 400), n);
		d = (x = $mul64(new $Uint64(0, 146097), n), new $Uint64(d.$high - x.$high, d.$low - x.$low));
		n = $div64(d, new $Uint64(0, 36524), false);
		n = (x$1 = $shiftRightUint64(n, 2), new $Uint64(n.$high - x$1.$high, n.$low - x$1.$low));
		y = (x$2 = $mul64(new $Uint64(0, 100), n), new $Uint64(y.$high + x$2.$high, y.$low + x$2.$low));
		d = (x$3 = $mul64(new $Uint64(0, 36524), n), new $Uint64(d.$high - x$3.$high, d.$low - x$3.$low));
		n = $div64(d, new $Uint64(0, 1461), false);
		y = (x$4 = $mul64(new $Uint64(0, 4), n), new $Uint64(y.$high + x$4.$high, y.$low + x$4.$low));
		d = (x$5 = $mul64(new $Uint64(0, 1461), n), new $Uint64(d.$high - x$5.$high, d.$low - x$5.$low));
		n = $div64(d, new $Uint64(0, 365), false);
		n = (x$6 = $shiftRightUint64(n, 2), new $Uint64(n.$high - x$6.$high, n.$low - x$6.$low));
		y = (x$7 = n, new $Uint64(y.$high + x$7.$high, y.$low + x$7.$low));
		d = (x$8 = $mul64(new $Uint64(0, 365), n), new $Uint64(d.$high - x$8.$high, d.$low - x$8.$low));
		year = ((x$9 = (x$10 = new $Int64(y.$high, y.$low), new $Int64(x$10.$high + -69, x$10.$low + 4075721025)), x$9.$low + ((x$9.$high >> 31) * 4294967296)) >> 0);
		yday = (d.$low >> 0);
		if (!full) {
			return [year, month, day, yday];
		}
		day = yday;
		if (isLeap(year)) {
			if (day > 59) {
				day = day - (1) >> 0;
			} else if (day === 59) {
				month = 2;
				day = 29;
				return [year, month, day, yday];
			}
		}
		month = ((_q = day / 31, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero")) >> 0);
		end = ((x$11 = month + 1 >> 0, ((x$11 < 0 || x$11 >= daysBefore.length) ? $throwRuntimeError("index out of range") : daysBefore[x$11])) >> 0);
		begin = 0;
		if (day >= end) {
			month = month + (1) >> 0;
			begin = end;
		} else {
			begin = (((month < 0 || month >= daysBefore.length) ? $throwRuntimeError("index out of range") : daysBefore[month]) >> 0);
		}
		month = month + (1) >> 0;
		day = (day - begin >> 0) + 1 >> 0;
		return [year, month, day, yday];
	};
	Time.ptr.prototype.UTC = function() {
		var t;
		t = $clone(this, Time);
		t.loc = $pkg.UTC;
		return t;
	};
	Time.prototype.UTC = function() { return this.$val.UTC(); };
	Time.ptr.prototype.Local = function() {
		var t;
		t = $clone(this, Time);
		t.loc = $pkg.Local;
		return t;
	};
	Time.prototype.Local = function() { return this.$val.Local(); };
	Time.ptr.prototype.In = function(loc) {
		var loc, t;
		t = $clone(this, Time);
		if (loc === ptrType$1.nil) {
			$panic(new $String("time: missing Location in call to Time.In"));
		}
		t.loc = loc;
		return t;
	};
	Time.prototype.In = function(loc) { return this.$val.In(loc); };
	Time.ptr.prototype.Location = function() {
		var l, t;
		t = $clone(this, Time);
		l = t.loc;
		if (l === ptrType$1.nil) {
			l = $pkg.UTC;
		}
		return l;
	};
	Time.prototype.Location = function() { return this.$val.Location(); };
	Time.ptr.prototype.Zone = function() {
		var _tuple$1, name = "", offset = 0, t, x;
		t = $clone(this, Time);
		_tuple$1 = t.loc.lookup((x = t.sec, new $Int64(x.$high + -15, x.$low + 2288912640))); name = _tuple$1[0]; offset = _tuple$1[1];
		return [name, offset];
	};
	Time.prototype.Zone = function() { return this.$val.Zone(); };
	Time.ptr.prototype.Unix = function() {
		var t, x;
		t = $clone(this, Time);
		return (x = t.sec, new $Int64(x.$high + -15, x.$low + 2288912640));
	};
	Time.prototype.Unix = function() { return this.$val.Unix(); };
	Time.ptr.prototype.UnixNano = function() {
		var t, x, x$1, x$2;
		t = $clone(this, Time);
		return (x = $mul64(((x$1 = t.sec, new $Int64(x$1.$high + -15, x$1.$low + 2288912640))), new $Int64(0, 1000000000)), x$2 = new $Int64(0, t.nsec), new $Int64(x.$high + x$2.$high, x.$low + x$2.$low));
	};
	Time.prototype.UnixNano = function() { return this.$val.UnixNano(); };
	Time.ptr.prototype.MarshalBinary = function() {
		var _q, _r$1, _tuple$1, enc, offset, offsetMin, t;
		t = $clone(this, Time);
		offsetMin = 0;
		if (t.Location() === utcLoc) {
			offsetMin = -1;
		} else {
			_tuple$1 = t.Zone(); offset = _tuple$1[1];
			if (!(((_r$1 = offset % 60, _r$1 === _r$1 ? _r$1 : $throwRuntimeError("integer divide by zero")) === 0))) {
				return [sliceType$3.nil, errors.New("Time.MarshalBinary: zone offset has fractional minute")];
			}
			offset = (_q = offset / (60), (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero"));
			if (offset < -32768 || (offset === -1) || offset > 32767) {
				return [sliceType$3.nil, errors.New("Time.MarshalBinary: unexpected zone offset")];
			}
			offsetMin = (offset << 16 >> 16);
		}
		enc = new sliceType$3([1, ($shiftRightInt64(t.sec, 56).$low << 24 >>> 24), ($shiftRightInt64(t.sec, 48).$low << 24 >>> 24), ($shiftRightInt64(t.sec, 40).$low << 24 >>> 24), ($shiftRightInt64(t.sec, 32).$low << 24 >>> 24), ($shiftRightInt64(t.sec, 24).$low << 24 >>> 24), ($shiftRightInt64(t.sec, 16).$low << 24 >>> 24), ($shiftRightInt64(t.sec, 8).$low << 24 >>> 24), (t.sec.$low << 24 >>> 24), ((t.nsec >> 24 >> 0) << 24 >>> 24), ((t.nsec >> 16 >> 0) << 24 >>> 24), ((t.nsec >> 8 >> 0) << 24 >>> 24), (t.nsec << 24 >>> 24), ((offsetMin >> 8 << 16 >> 16) << 24 >>> 24), (offsetMin << 24 >>> 24)]);
		return [enc, $ifaceNil];
	};
	Time.prototype.MarshalBinary = function() { return this.$val.MarshalBinary(); };
	Time.ptr.prototype.UnmarshalBinary = function(data$1) {
		var _tuple$1, buf, data$1, localoff, offset, t, x, x$1, x$10, x$11, x$12, x$13, x$14, x$2, x$3, x$4, x$5, x$6, x$7, x$8, x$9;
		t = this;
		buf = data$1;
		if (buf.$length === 0) {
			return errors.New("Time.UnmarshalBinary: no data");
		}
		if (!((((0 < 0 || 0 >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + 0]) === 1))) {
			return errors.New("Time.UnmarshalBinary: unsupported version");
		}
		if (!((buf.$length === 15))) {
			return errors.New("Time.UnmarshalBinary: invalid length");
		}
		buf = $subslice(buf, 1);
		t.sec = (x = (x$1 = (x$2 = (x$3 = (x$4 = (x$5 = (x$6 = new $Int64(0, ((7 < 0 || 7 >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + 7])), x$7 = $shiftLeft64(new $Int64(0, ((6 < 0 || 6 >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + 6])), 8), new $Int64(x$6.$high | x$7.$high, (x$6.$low | x$7.$low) >>> 0)), x$8 = $shiftLeft64(new $Int64(0, ((5 < 0 || 5 >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + 5])), 16), new $Int64(x$5.$high | x$8.$high, (x$5.$low | x$8.$low) >>> 0)), x$9 = $shiftLeft64(new $Int64(0, ((4 < 0 || 4 >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + 4])), 24), new $Int64(x$4.$high | x$9.$high, (x$4.$low | x$9.$low) >>> 0)), x$10 = $shiftLeft64(new $Int64(0, ((3 < 0 || 3 >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + 3])), 32), new $Int64(x$3.$high | x$10.$high, (x$3.$low | x$10.$low) >>> 0)), x$11 = $shiftLeft64(new $Int64(0, ((2 < 0 || 2 >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + 2])), 40), new $Int64(x$2.$high | x$11.$high, (x$2.$low | x$11.$low) >>> 0)), x$12 = $shiftLeft64(new $Int64(0, ((1 < 0 || 1 >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + 1])), 48), new $Int64(x$1.$high | x$12.$high, (x$1.$low | x$12.$low) >>> 0)), x$13 = $shiftLeft64(new $Int64(0, ((0 < 0 || 0 >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + 0])), 56), new $Int64(x.$high | x$13.$high, (x.$low | x$13.$low) >>> 0));
		buf = $subslice(buf, 8);
		t.nsec = (((((3 < 0 || 3 >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + 3]) >> 0) | ((((2 < 0 || 2 >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + 2]) >> 0) << 8 >> 0)) | ((((1 < 0 || 1 >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + 1]) >> 0) << 16 >> 0)) | ((((0 < 0 || 0 >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + 0]) >> 0) << 24 >> 0);
		buf = $subslice(buf, 4);
		offset = (((((1 < 0 || 1 >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + 1]) << 16 >> 16) | ((((0 < 0 || 0 >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + 0]) << 16 >> 16) << 8 << 16 >> 16)) >> 0) * 60 >> 0;
		if (offset === -60) {
			t.loc = utcLoc;
		} else {
			_tuple$1 = $pkg.Local.lookup((x$14 = t.sec, new $Int64(x$14.$high + -15, x$14.$low + 2288912640))); localoff = _tuple$1[1];
			if (offset === localoff) {
				t.loc = $pkg.Local;
			} else {
				t.loc = FixedZone("", offset);
			}
		}
		return $ifaceNil;
	};
	Time.prototype.UnmarshalBinary = function(data$1) { return this.$val.UnmarshalBinary(data$1); };
	Time.ptr.prototype.GobEncode = function() {
		var t;
		t = $clone(this, Time);
		return t.MarshalBinary();
	};
	Time.prototype.GobEncode = function() { return this.$val.GobEncode(); };
	Time.ptr.prototype.GobDecode = function(data$1) {
		var data$1, t;
		t = this;
		return t.UnmarshalBinary(data$1);
	};
	Time.prototype.GobDecode = function(data$1) { return this.$val.GobDecode(data$1); };
	Time.ptr.prototype.MarshalJSON = function() {
		var t, y;
		t = $clone(this, Time);
		y = t.Year();
		if (y < 0 || y >= 10000) {
			return [sliceType$3.nil, errors.New("Time.MarshalJSON: year outside of range [0,9999]")];
		}
		return [new sliceType$3($stringToBytes(t.Format("\"2006-01-02T15:04:05.999999999Z07:00\""))), $ifaceNil];
	};
	Time.prototype.MarshalJSON = function() { return this.$val.MarshalJSON(); };
	Time.ptr.prototype.UnmarshalJSON = function(data$1) {
		var _tuple$1, data$1, err = $ifaceNil, t;
		t = this;
		_tuple$1 = Parse("\"2006-01-02T15:04:05Z07:00\"", $bytesToString(data$1)); $copy(t, _tuple$1[0], Time); err = _tuple$1[1];
		return err;
	};
	Time.prototype.UnmarshalJSON = function(data$1) { return this.$val.UnmarshalJSON(data$1); };
	Time.ptr.prototype.MarshalText = function() {
		var t, y;
		t = $clone(this, Time);
		y = t.Year();
		if (y < 0 || y >= 10000) {
			return [sliceType$3.nil, errors.New("Time.MarshalText: year outside of range [0,9999]")];
		}
		return [new sliceType$3($stringToBytes(t.Format("2006-01-02T15:04:05.999999999Z07:00"))), $ifaceNil];
	};
	Time.prototype.MarshalText = function() { return this.$val.MarshalText(); };
	Time.ptr.prototype.UnmarshalText = function(data$1) {
		var _tuple$1, data$1, err = $ifaceNil, t;
		t = this;
		_tuple$1 = Parse("2006-01-02T15:04:05Z07:00", $bytesToString(data$1)); $copy(t, _tuple$1[0], Time); err = _tuple$1[1];
		return err;
	};
	Time.prototype.UnmarshalText = function(data$1) { return this.$val.UnmarshalText(data$1); };
	Unix = $pkg.Unix = function(sec, nsec) {
		var n, nsec, sec, x, x$1, x$2, x$3;
		if ((nsec.$high < 0 || (nsec.$high === 0 && nsec.$low < 0)) || (nsec.$high > 0 || (nsec.$high === 0 && nsec.$low >= 1000000000))) {
			n = $div64(nsec, new $Int64(0, 1000000000), false);
			sec = (x = n, new $Int64(sec.$high + x.$high, sec.$low + x.$low));
			nsec = (x$1 = $mul64(n, new $Int64(0, 1000000000)), new $Int64(nsec.$high - x$1.$high, nsec.$low - x$1.$low));
			if ((nsec.$high < 0 || (nsec.$high === 0 && nsec.$low < 0))) {
				nsec = (x$2 = new $Int64(0, 1000000000), new $Int64(nsec.$high + x$2.$high, nsec.$low + x$2.$low));
				sec = (x$3 = new $Int64(0, 1), new $Int64(sec.$high - x$3.$high, sec.$low - x$3.$low));
			}
		}
		return new Time.ptr(new $Int64(sec.$high + 14, sec.$low + 2006054656), ((nsec.$low + ((nsec.$high >> 31) * 4294967296)) >> 0), $pkg.Local);
	};
	isLeap = function(year) {
		var _r$1, _r$2, _r$3, year;
		return ((_r$1 = year % 4, _r$1 === _r$1 ? _r$1 : $throwRuntimeError("integer divide by zero")) === 0) && (!(((_r$2 = year % 100, _r$2 === _r$2 ? _r$2 : $throwRuntimeError("integer divide by zero")) === 0)) || ((_r$3 = year % 400, _r$3 === _r$3 ? _r$3 : $throwRuntimeError("integer divide by zero")) === 0));
	};
	norm = function(hi, lo, base) {
		var _q, _q$1, _tmp, _tmp$1, base, hi, lo, n, n$1, nhi = 0, nlo = 0;
		if (lo < 0) {
			n = (_q = ((-lo - 1 >> 0)) / base, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero")) + 1 >> 0;
			hi = hi - (n) >> 0;
			lo = lo + ((n * base >> 0)) >> 0;
		}
		if (lo >= base) {
			n$1 = (_q$1 = lo / base, (_q$1 === _q$1 && _q$1 !== 1/0 && _q$1 !== -1/0) ? _q$1 >> 0 : $throwRuntimeError("integer divide by zero"));
			hi = hi + (n$1) >> 0;
			lo = lo - ((n$1 * base >> 0)) >> 0;
		}
		_tmp = hi; _tmp$1 = lo; nhi = _tmp; nlo = _tmp$1;
		return [nhi, nlo];
	};
	Date = $pkg.Date = function(year, month, day, hour, min, sec, nsec, loc) {
		var _tuple$1, _tuple$2, _tuple$3, _tuple$4, _tuple$5, _tuple$6, _tuple$7, _tuple$8, abs, d, day, end, hour, loc, m, min, month, n, nsec, offset, sec, start, unix, utc, x, x$1, x$10, x$11, x$12, x$13, x$14, x$15, x$2, x$3, x$4, x$5, x$6, x$7, x$8, x$9, y, year;
		if (loc === ptrType$1.nil) {
			$panic(new $String("time: missing Location in call to Date"));
		}
		m = (month >> 0) - 1 >> 0;
		_tuple$1 = norm(year, m, 12); year = _tuple$1[0]; m = _tuple$1[1];
		month = (m >> 0) + 1 >> 0;
		_tuple$2 = norm(sec, nsec, 1000000000); sec = _tuple$2[0]; nsec = _tuple$2[1];
		_tuple$3 = norm(min, sec, 60); min = _tuple$3[0]; sec = _tuple$3[1];
		_tuple$4 = norm(hour, min, 60); hour = _tuple$4[0]; min = _tuple$4[1];
		_tuple$5 = norm(day, hour, 24); day = _tuple$5[0]; hour = _tuple$5[1];
		y = (x = (x$1 = new $Int64(0, year), new $Int64(x$1.$high - -69, x$1.$low - 4075721025)), new $Uint64(x.$high, x.$low));
		n = $div64(y, new $Uint64(0, 400), false);
		y = (x$2 = $mul64(new $Uint64(0, 400), n), new $Uint64(y.$high - x$2.$high, y.$low - x$2.$low));
		d = $mul64(new $Uint64(0, 146097), n);
		n = $div64(y, new $Uint64(0, 100), false);
		y = (x$3 = $mul64(new $Uint64(0, 100), n), new $Uint64(y.$high - x$3.$high, y.$low - x$3.$low));
		d = (x$4 = $mul64(new $Uint64(0, 36524), n), new $Uint64(d.$high + x$4.$high, d.$low + x$4.$low));
		n = $div64(y, new $Uint64(0, 4), false);
		y = (x$5 = $mul64(new $Uint64(0, 4), n), new $Uint64(y.$high - x$5.$high, y.$low - x$5.$low));
		d = (x$6 = $mul64(new $Uint64(0, 1461), n), new $Uint64(d.$high + x$6.$high, d.$low + x$6.$low));
		n = y;
		d = (x$7 = $mul64(new $Uint64(0, 365), n), new $Uint64(d.$high + x$7.$high, d.$low + x$7.$low));
		d = (x$8 = new $Uint64(0, (x$9 = month - 1 >> 0, ((x$9 < 0 || x$9 >= daysBefore.length) ? $throwRuntimeError("index out of range") : daysBefore[x$9]))), new $Uint64(d.$high + x$8.$high, d.$low + x$8.$low));
		if (isLeap(year) && month >= 3) {
			d = (x$10 = new $Uint64(0, 1), new $Uint64(d.$high + x$10.$high, d.$low + x$10.$low));
		}
		d = (x$11 = new $Uint64(0, (day - 1 >> 0)), new $Uint64(d.$high + x$11.$high, d.$low + x$11.$low));
		abs = $mul64(d, new $Uint64(0, 86400));
		abs = (x$12 = new $Uint64(0, (((hour * 3600 >> 0) + (min * 60 >> 0) >> 0) + sec >> 0)), new $Uint64(abs.$high + x$12.$high, abs.$low + x$12.$low));
		unix = (x$13 = new $Int64(abs.$high, abs.$low), new $Int64(x$13.$high + -2147483647, x$13.$low + 3844486912));
		_tuple$6 = loc.lookup(unix); offset = _tuple$6[1]; start = _tuple$6[3]; end = _tuple$6[4];
		if (!((offset === 0))) {
			utc = (x$14 = new $Int64(0, offset), new $Int64(unix.$high - x$14.$high, unix.$low - x$14.$low));
			if ((utc.$high < start.$high || (utc.$high === start.$high && utc.$low < start.$low))) {
				_tuple$7 = loc.lookup(new $Int64(start.$high - 0, start.$low - 1)); offset = _tuple$7[1];
			} else if ((utc.$high > end.$high || (utc.$high === end.$high && utc.$low >= end.$low))) {
				_tuple$8 = loc.lookup(end); offset = _tuple$8[1];
			}
			unix = (x$15 = new $Int64(0, offset), new $Int64(unix.$high - x$15.$high, unix.$low - x$15.$low));
		}
		return new Time.ptr(new $Int64(unix.$high + 14, unix.$low + 2006054656), (nsec >> 0), loc);
	};
	Time.ptr.prototype.Truncate = function(d) {
		var _tuple$1, d, r, t;
		t = $clone(this, Time);
		if ((d.$high < 0 || (d.$high === 0 && d.$low <= 0))) {
			return t;
		}
		_tuple$1 = div(t, d); r = _tuple$1[1];
		return t.Add(new Duration(-r.$high, -r.$low));
	};
	Time.prototype.Truncate = function(d) { return this.$val.Truncate(d); };
	Time.ptr.prototype.Round = function(d) {
		var _tuple$1, d, r, t, x;
		t = $clone(this, Time);
		if ((d.$high < 0 || (d.$high === 0 && d.$low <= 0))) {
			return t;
		}
		_tuple$1 = div(t, d); r = _tuple$1[1];
		if ((x = new Duration(r.$high + r.$high, r.$low + r.$low), (x.$high < d.$high || (x.$high === d.$high && x.$low < d.$low)))) {
			return t.Add(new Duration(-r.$high, -r.$low));
		}
		return t.Add(new Duration(d.$high - r.$high, d.$low - r.$low));
	};
	Time.prototype.Round = function(d) { return this.$val.Round(d); };
	div = function(t, d) {
		var _q, _r$1, _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, d, d0, d1, d1$1, neg, nsec, qmod2 = 0, r = new Duration(0, 0), sec, t, tmp, u0, u0x, u1, x, x$1, x$10, x$11, x$12, x$13, x$14, x$15, x$16, x$17, x$18, x$19, x$2, x$3, x$4, x$5, x$6, x$7, x$8, x$9;
		t = $clone(t, Time);
		neg = false;
		nsec = t.nsec;
		if ((x = t.sec, (x.$high < 0 || (x.$high === 0 && x.$low < 0)))) {
			neg = true;
			t.sec = (x$1 = t.sec, new $Int64(-x$1.$high, -x$1.$low));
			nsec = -nsec;
			if (nsec < 0) {
				nsec = nsec + (1000000000) >> 0;
				t.sec = (x$2 = t.sec, x$3 = new $Int64(0, 1), new $Int64(x$2.$high - x$3.$high, x$2.$low - x$3.$low));
			}
		}
		if ((d.$high < 0 || (d.$high === 0 && d.$low < 1000000000)) && (x$4 = $div64(new Duration(0, 1000000000), (new Duration(d.$high + d.$high, d.$low + d.$low)), true), (x$4.$high === 0 && x$4.$low === 0))) {
			qmod2 = ((_q = nsec / ((d.$low + ((d.$high >> 31) * 4294967296)) >> 0), (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero")) >> 0) & 1;
			r = new Duration(0, (_r$1 = nsec % ((d.$low + ((d.$high >> 31) * 4294967296)) >> 0), _r$1 === _r$1 ? _r$1 : $throwRuntimeError("integer divide by zero")));
		} else if ((x$5 = $div64(d, new Duration(0, 1000000000), true), (x$5.$high === 0 && x$5.$low === 0))) {
			d1 = (x$6 = $div64(d, new Duration(0, 1000000000), false), new $Int64(x$6.$high, x$6.$low));
			qmod2 = ((x$7 = $div64(t.sec, d1, false), x$7.$low + ((x$7.$high >> 31) * 4294967296)) >> 0) & 1;
			r = (x$8 = $mul64((x$9 = $div64(t.sec, d1, true), new Duration(x$9.$high, x$9.$low)), new Duration(0, 1000000000)), x$10 = new Duration(0, nsec), new Duration(x$8.$high + x$10.$high, x$8.$low + x$10.$low));
		} else {
			sec = (x$11 = t.sec, new $Uint64(x$11.$high, x$11.$low));
			tmp = $mul64(($shiftRightUint64(sec, 32)), new $Uint64(0, 1000000000));
			u1 = $shiftRightUint64(tmp, 32);
			u0 = $shiftLeft64(tmp, 32);
			tmp = $mul64(new $Uint64(sec.$high & 0, (sec.$low & 4294967295) >>> 0), new $Uint64(0, 1000000000));
			_tmp = u0; _tmp$1 = new $Uint64(u0.$high + tmp.$high, u0.$low + tmp.$low); u0x = _tmp; u0 = _tmp$1;
			if ((u0.$high < u0x.$high || (u0.$high === u0x.$high && u0.$low < u0x.$low))) {
				u1 = (x$12 = new $Uint64(0, 1), new $Uint64(u1.$high + x$12.$high, u1.$low + x$12.$low));
			}
			_tmp$2 = u0; _tmp$3 = (x$13 = new $Uint64(0, nsec), new $Uint64(u0.$high + x$13.$high, u0.$low + x$13.$low)); u0x = _tmp$2; u0 = _tmp$3;
			if ((u0.$high < u0x.$high || (u0.$high === u0x.$high && u0.$low < u0x.$low))) {
				u1 = (x$14 = new $Uint64(0, 1), new $Uint64(u1.$high + x$14.$high, u1.$low + x$14.$low));
			}
			d1$1 = new $Uint64(d.$high, d.$low);
			while (true) {
				if (!(!((x$15 = $shiftRightUint64(d1$1, 63), (x$15.$high === 0 && x$15.$low === 1))))) { break; }
				d1$1 = $shiftLeft64(d1$1, (1));
			}
			d0 = new $Uint64(0, 0);
			while (true) {
				if (!(true)) { break; }
				qmod2 = 0;
				if ((u1.$high > d1$1.$high || (u1.$high === d1$1.$high && u1.$low > d1$1.$low)) || (u1.$high === d1$1.$high && u1.$low === d1$1.$low) && (u0.$high > d0.$high || (u0.$high === d0.$high && u0.$low >= d0.$low))) {
					qmod2 = 1;
					_tmp$4 = u0; _tmp$5 = new $Uint64(u0.$high - d0.$high, u0.$low - d0.$low); u0x = _tmp$4; u0 = _tmp$5;
					if ((u0.$high > u0x.$high || (u0.$high === u0x.$high && u0.$low > u0x.$low))) {
						u1 = (x$16 = new $Uint64(0, 1), new $Uint64(u1.$high - x$16.$high, u1.$low - x$16.$low));
					}
					u1 = (x$17 = d1$1, new $Uint64(u1.$high - x$17.$high, u1.$low - x$17.$low));
				}
				if ((d1$1.$high === 0 && d1$1.$low === 0) && (x$18 = new $Uint64(d.$high, d.$low), (d0.$high === x$18.$high && d0.$low === x$18.$low))) {
					break;
				}
				d0 = $shiftRightUint64(d0, (1));
				d0 = (x$19 = $shiftLeft64((new $Uint64(d1$1.$high & 0, (d1$1.$low & 1) >>> 0)), 63), new $Uint64(d0.$high | x$19.$high, (d0.$low | x$19.$low) >>> 0));
				d1$1 = $shiftRightUint64(d1$1, (1));
			}
			r = new Duration(u0.$high, u0.$low);
		}
		if (neg && !((r.$high === 0 && r.$low === 0))) {
			qmod2 = (qmod2 ^ (1)) >> 0;
			r = new Duration(d.$high - r.$high, d.$low - r.$low);
		}
		return [qmod2, r];
	};
	Location.ptr.prototype.get = function() {
		var l;
		l = this;
		if (l === ptrType$1.nil) {
			return utcLoc;
		}
		if (l === localLoc) {
			localOnce.Do(initLocal);
		}
		return l;
	};
	Location.prototype.get = function() { return this.$val.get(); };
	Location.ptr.prototype.String = function() {
		var l;
		l = this;
		return l.get().name;
	};
	Location.prototype.String = function() { return this.$val.String(); };
	FixedZone = $pkg.FixedZone = function(name, offset) {
		var l, name, offset, x;
		l = new Location.ptr(name, new sliceType$1([new zone.ptr(name, offset, false)]), new sliceType$2([new zoneTrans.ptr(new $Int64(-2147483648, 0), 0, false, false)]), new $Int64(-2147483648, 0), new $Int64(2147483647, 4294967295), ptrType.nil);
		l.cacheZone = (x = l.zone, ((0 < 0 || 0 >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + 0]));
		return l;
	};
	Location.ptr.prototype.lookup = function(sec) {
		var _q, end = new $Int64(0, 0), hi, isDST = false, l, lim, lo, m, name = "", offset = 0, sec, start = new $Int64(0, 0), tx, x, x$1, x$2, x$3, x$4, x$5, x$6, x$7, x$8, zone$1, zone$2, zone$3;
		l = this;
		l = l.get();
		if (l.zone.$length === 0) {
			name = "UTC";
			offset = 0;
			isDST = false;
			start = new $Int64(-2147483648, 0);
			end = new $Int64(2147483647, 4294967295);
			return [name, offset, isDST, start, end];
		}
		zone$1 = l.cacheZone;
		if (!(zone$1 === ptrType.nil) && (x = l.cacheStart, (x.$high < sec.$high || (x.$high === sec.$high && x.$low <= sec.$low))) && (x$1 = l.cacheEnd, (sec.$high < x$1.$high || (sec.$high === x$1.$high && sec.$low < x$1.$low)))) {
			name = zone$1.name;
			offset = zone$1.offset;
			isDST = zone$1.isDST;
			start = l.cacheStart;
			end = l.cacheEnd;
			return [name, offset, isDST, start, end];
		}
		if ((l.tx.$length === 0) || (x$2 = (x$3 = l.tx, ((0 < 0 || 0 >= x$3.$length) ? $throwRuntimeError("index out of range") : x$3.$array[x$3.$offset + 0])).when, (sec.$high < x$2.$high || (sec.$high === x$2.$high && sec.$low < x$2.$low)))) {
			zone$2 = (x$4 = l.zone, x$5 = l.lookupFirstZone(), ((x$5 < 0 || x$5 >= x$4.$length) ? $throwRuntimeError("index out of range") : x$4.$array[x$4.$offset + x$5]));
			name = zone$2.name;
			offset = zone$2.offset;
			isDST = zone$2.isDST;
			start = new $Int64(-2147483648, 0);
			if (l.tx.$length > 0) {
				end = (x$6 = l.tx, ((0 < 0 || 0 >= x$6.$length) ? $throwRuntimeError("index out of range") : x$6.$array[x$6.$offset + 0])).when;
			} else {
				end = new $Int64(2147483647, 4294967295);
			}
			return [name, offset, isDST, start, end];
		}
		tx = l.tx;
		end = new $Int64(2147483647, 4294967295);
		lo = 0;
		hi = tx.$length;
		while (true) {
			if (!((hi - lo >> 0) > 1)) { break; }
			m = lo + (_q = ((hi - lo >> 0)) / 2, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero")) >> 0;
			lim = ((m < 0 || m >= tx.$length) ? $throwRuntimeError("index out of range") : tx.$array[tx.$offset + m]).when;
			if ((sec.$high < lim.$high || (sec.$high === lim.$high && sec.$low < lim.$low))) {
				end = lim;
				hi = m;
			} else {
				lo = m;
			}
		}
		zone$3 = (x$7 = l.zone, x$8 = ((lo < 0 || lo >= tx.$length) ? $throwRuntimeError("index out of range") : tx.$array[tx.$offset + lo]).index, ((x$8 < 0 || x$8 >= x$7.$length) ? $throwRuntimeError("index out of range") : x$7.$array[x$7.$offset + x$8]));
		name = zone$3.name;
		offset = zone$3.offset;
		isDST = zone$3.isDST;
		start = ((lo < 0 || lo >= tx.$length) ? $throwRuntimeError("index out of range") : tx.$array[tx.$offset + lo]).when;
		return [name, offset, isDST, start, end];
	};
	Location.prototype.lookup = function(sec) { return this.$val.lookup(sec); };
	Location.ptr.prototype.lookupFirstZone = function() {
		var _i, _ref, l, x, x$1, x$2, x$3, x$4, x$5, zi, zi$1;
		l = this;
		if (!l.firstZoneUsed()) {
			return 0;
		}
		if (l.tx.$length > 0 && (x = l.zone, x$1 = (x$2 = l.tx, ((0 < 0 || 0 >= x$2.$length) ? $throwRuntimeError("index out of range") : x$2.$array[x$2.$offset + 0])).index, ((x$1 < 0 || x$1 >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + x$1])).isDST) {
			zi = ((x$3 = l.tx, ((0 < 0 || 0 >= x$3.$length) ? $throwRuntimeError("index out of range") : x$3.$array[x$3.$offset + 0])).index >> 0) - 1 >> 0;
			while (true) {
				if (!(zi >= 0)) { break; }
				if (!(x$4 = l.zone, ((zi < 0 || zi >= x$4.$length) ? $throwRuntimeError("index out of range") : x$4.$array[x$4.$offset + zi])).isDST) {
					return zi;
				}
				zi = zi - (1) >> 0;
			}
		}
		_ref = l.zone;
		_i = 0;
		while (true) {
			if (!(_i < _ref.$length)) { break; }
			zi$1 = _i;
			if (!(x$5 = l.zone, ((zi$1 < 0 || zi$1 >= x$5.$length) ? $throwRuntimeError("index out of range") : x$5.$array[x$5.$offset + zi$1])).isDST) {
				return zi$1;
			}
			_i++;
		}
		return 0;
	};
	Location.prototype.lookupFirstZone = function() { return this.$val.lookupFirstZone(); };
	Location.ptr.prototype.firstZoneUsed = function() {
		var _i, _ref, l, tx;
		l = this;
		_ref = l.tx;
		_i = 0;
		while (true) {
			if (!(_i < _ref.$length)) { break; }
			tx = $clone(((_i < 0 || _i >= _ref.$length) ? $throwRuntimeError("index out of range") : _ref.$array[_ref.$offset + _i]), zoneTrans);
			if (tx.index === 0) {
				return true;
			}
			_i++;
		}
		return false;
	};
	Location.prototype.firstZoneUsed = function() { return this.$val.firstZoneUsed(); };
	Location.ptr.prototype.lookupName = function(name, unix) {
		var _i, _i$1, _ref, _ref$1, _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, _tuple$1, i, i$1, isDST = false, isDST$1, l, nam, name, offset = 0, offset$1, ok = false, unix, x, x$1, x$2, zone$1, zone$2;
		l = this;
		l = l.get();
		_ref = l.zone;
		_i = 0;
		while (true) {
			if (!(_i < _ref.$length)) { break; }
			i = _i;
			zone$1 = (x = l.zone, ((i < 0 || i >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + i]));
			if (zone$1.name === name) {
				_tuple$1 = l.lookup((x$1 = new $Int64(0, zone$1.offset), new $Int64(unix.$high - x$1.$high, unix.$low - x$1.$low))); nam = _tuple$1[0]; offset$1 = _tuple$1[1]; isDST$1 = _tuple$1[2];
				if (nam === zone$1.name) {
					_tmp = offset$1; _tmp$1 = isDST$1; _tmp$2 = true; offset = _tmp; isDST = _tmp$1; ok = _tmp$2;
					return [offset, isDST, ok];
				}
			}
			_i++;
		}
		_ref$1 = l.zone;
		_i$1 = 0;
		while (true) {
			if (!(_i$1 < _ref$1.$length)) { break; }
			i$1 = _i$1;
			zone$2 = (x$2 = l.zone, ((i$1 < 0 || i$1 >= x$2.$length) ? $throwRuntimeError("index out of range") : x$2.$array[x$2.$offset + i$1]));
			if (zone$2.name === name) {
				_tmp$3 = zone$2.offset; _tmp$4 = zone$2.isDST; _tmp$5 = true; offset = _tmp$3; isDST = _tmp$4; ok = _tmp$5;
				return [offset, isDST, ok];
			}
			_i$1++;
		}
		return [offset, isDST, ok];
	};
	Location.prototype.lookupName = function(name, unix) { return this.$val.lookupName(name, unix); };
	ptrType$2.methods = [{prop: "Error", name: "Error", pkg: "", typ: $funcType([], [$String], false)}];
	Time.methods = [{prop: "String", name: "String", pkg: "", typ: $funcType([], [$String], false)}, {prop: "Format", name: "Format", pkg: "", typ: $funcType([$String], [$String], false)}, {prop: "After", name: "After", pkg: "", typ: $funcType([Time], [$Bool], false)}, {prop: "Before", name: "Before", pkg: "", typ: $funcType([Time], [$Bool], false)}, {prop: "Equal", name: "Equal", pkg: "", typ: $funcType([Time], [$Bool], false)}, {prop: "IsZero", name: "IsZero", pkg: "", typ: $funcType([], [$Bool], false)}, {prop: "abs", name: "abs", pkg: "time", typ: $funcType([], [$Uint64], false)}, {prop: "locabs", name: "locabs", pkg: "time", typ: $funcType([], [$String, $Int, $Uint64], false)}, {prop: "Date", name: "Date", pkg: "", typ: $funcType([], [$Int, Month, $Int], false)}, {prop: "Year", name: "Year", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "Month", name: "Month", pkg: "", typ: $funcType([], [Month], false)}, {prop: "Day", name: "Day", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "Weekday", name: "Weekday", pkg: "", typ: $funcType([], [Weekday], false)}, {prop: "ISOWeek", name: "ISOWeek", pkg: "", typ: $funcType([], [$Int, $Int], false)}, {prop: "Clock", name: "Clock", pkg: "", typ: $funcType([], [$Int, $Int, $Int], false)}, {prop: "Hour", name: "Hour", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "Minute", name: "Minute", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "Second", name: "Second", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "Nanosecond", name: "Nanosecond", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "YearDay", name: "YearDay", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "Add", name: "Add", pkg: "", typ: $funcType([Duration], [Time], false)}, {prop: "Sub", name: "Sub", pkg: "", typ: $funcType([Time], [Duration], false)}, {prop: "AddDate", name: "AddDate", pkg: "", typ: $funcType([$Int, $Int, $Int], [Time], false)}, {prop: "date", name: "date", pkg: "time", typ: $funcType([$Bool], [$Int, Month, $Int, $Int], false)}, {prop: "UTC", name: "UTC", pkg: "", typ: $funcType([], [Time], false)}, {prop: "Local", name: "Local", pkg: "", typ: $funcType([], [Time], false)}, {prop: "In", name: "In", pkg: "", typ: $funcType([ptrType$1], [Time], false)}, {prop: "Location", name: "Location", pkg: "", typ: $funcType([], [ptrType$1], false)}, {prop: "Zone", name: "Zone", pkg: "", typ: $funcType([], [$String, $Int], false)}, {prop: "Unix", name: "Unix", pkg: "", typ: $funcType([], [$Int64], false)}, {prop: "UnixNano", name: "UnixNano", pkg: "", typ: $funcType([], [$Int64], false)}, {prop: "MarshalBinary", name: "MarshalBinary", pkg: "", typ: $funcType([], [sliceType$3, $error], false)}, {prop: "GobEncode", name: "GobEncode", pkg: "", typ: $funcType([], [sliceType$3, $error], false)}, {prop: "MarshalJSON", name: "MarshalJSON", pkg: "", typ: $funcType([], [sliceType$3, $error], false)}, {prop: "MarshalText", name: "MarshalText", pkg: "", typ: $funcType([], [sliceType$3, $error], false)}, {prop: "Truncate", name: "Truncate", pkg: "", typ: $funcType([Duration], [Time], false)}, {prop: "Round", name: "Round", pkg: "", typ: $funcType([Duration], [Time], false)}];
	ptrType$5.methods = [{prop: "UnmarshalBinary", name: "UnmarshalBinary", pkg: "", typ: $funcType([sliceType$3], [$error], false)}, {prop: "GobDecode", name: "GobDecode", pkg: "", typ: $funcType([sliceType$3], [$error], false)}, {prop: "UnmarshalJSON", name: "UnmarshalJSON", pkg: "", typ: $funcType([sliceType$3], [$error], false)}, {prop: "UnmarshalText", name: "UnmarshalText", pkg: "", typ: $funcType([sliceType$3], [$error], false)}];
	Month.methods = [{prop: "String", name: "String", pkg: "", typ: $funcType([], [$String], false)}];
	Weekday.methods = [{prop: "String", name: "String", pkg: "", typ: $funcType([], [$String], false)}];
	Duration.methods = [{prop: "String", name: "String", pkg: "", typ: $funcType([], [$String], false)}, {prop: "Nanoseconds", name: "Nanoseconds", pkg: "", typ: $funcType([], [$Int64], false)}, {prop: "Seconds", name: "Seconds", pkg: "", typ: $funcType([], [$Float64], false)}, {prop: "Minutes", name: "Minutes", pkg: "", typ: $funcType([], [$Float64], false)}, {prop: "Hours", name: "Hours", pkg: "", typ: $funcType([], [$Float64], false)}];
	ptrType$1.methods = [{prop: "get", name: "get", pkg: "time", typ: $funcType([], [ptrType$1], false)}, {prop: "String", name: "String", pkg: "", typ: $funcType([], [$String], false)}, {prop: "lookup", name: "lookup", pkg: "time", typ: $funcType([$Int64], [$String, $Int, $Bool, $Int64, $Int64], false)}, {prop: "lookupFirstZone", name: "lookupFirstZone", pkg: "time", typ: $funcType([], [$Int], false)}, {prop: "firstZoneUsed", name: "firstZoneUsed", pkg: "time", typ: $funcType([], [$Bool], false)}, {prop: "lookupName", name: "lookupName", pkg: "time", typ: $funcType([$String, $Int64], [$Int, $Bool, $Bool], false)}];
	ParseError.init([{prop: "Layout", name: "Layout", pkg: "", typ: $String, tag: ""}, {prop: "Value", name: "Value", pkg: "", typ: $String, tag: ""}, {prop: "LayoutElem", name: "LayoutElem", pkg: "", typ: $String, tag: ""}, {prop: "ValueElem", name: "ValueElem", pkg: "", typ: $String, tag: ""}, {prop: "Message", name: "Message", pkg: "", typ: $String, tag: ""}]);
	Time.init([{prop: "sec", name: "sec", pkg: "time", typ: $Int64, tag: ""}, {prop: "nsec", name: "nsec", pkg: "time", typ: $Int32, tag: ""}, {prop: "loc", name: "loc", pkg: "time", typ: ptrType$1, tag: ""}]);
	Location.init([{prop: "name", name: "name", pkg: "time", typ: $String, tag: ""}, {prop: "zone", name: "zone", pkg: "time", typ: sliceType$1, tag: ""}, {prop: "tx", name: "tx", pkg: "time", typ: sliceType$2, tag: ""}, {prop: "cacheStart", name: "cacheStart", pkg: "time", typ: $Int64, tag: ""}, {prop: "cacheEnd", name: "cacheEnd", pkg: "time", typ: $Int64, tag: ""}, {prop: "cacheZone", name: "cacheZone", pkg: "time", typ: ptrType, tag: ""}]);
	zone.init([{prop: "name", name: "name", pkg: "time", typ: $String, tag: ""}, {prop: "offset", name: "offset", pkg: "time", typ: $Int, tag: ""}, {prop: "isDST", name: "isDST", pkg: "time", typ: $Bool, tag: ""}]);
	zoneTrans.init([{prop: "when", name: "when", pkg: "time", typ: $Int64, tag: ""}, {prop: "index", name: "index", pkg: "time", typ: $Uint8, tag: ""}, {prop: "isstd", name: "isstd", pkg: "time", typ: $Bool, tag: ""}, {prop: "isutc", name: "isutc", pkg: "time", typ: $Bool, tag: ""}]);
	$pkg.$init = function() {
		$pkg.$init = function() {};
		/* */ var $r, $s = 0; var $init_time = function() { while (true) { switch ($s) { case 0:
		$r = errors.$init($BLOCKING); /* */ $s = 1; case 1: if ($r && $r.$blocking) { $r = $r(); }
		$r = js.$init($BLOCKING); /* */ $s = 2; case 2: if ($r && $r.$blocking) { $r = $r(); }
		$r = nosync.$init($BLOCKING); /* */ $s = 3; case 3: if ($r && $r.$blocking) { $r = $r(); }
		$r = runtime.$init($BLOCKING); /* */ $s = 4; case 4: if ($r && $r.$blocking) { $r = $r(); }
		$r = strings.$init($BLOCKING); /* */ $s = 5; case 5: if ($r && $r.$blocking) { $r = $r(); }
		$r = syscall.$init($BLOCKING); /* */ $s = 6; case 6: if ($r && $r.$blocking) { $r = $r(); }
		localLoc = new Location.ptr();
		localOnce = new nosync.Once.ptr();
		std0x = $toNativeArray($kindInt, [260, 265, 524, 526, 528, 274]);
		longDayNames = new sliceType(["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]);
		shortDayNames = new sliceType(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
		shortMonthNames = new sliceType(["---", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]);
		longMonthNames = new sliceType(["---", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]);
		atoiError = errors.New("time: invalid number");
		errBad = errors.New("bad value for field");
		errLeadingInt = errors.New("time: bad [0-9]*");
		months = $toNativeArray($kindString, ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]);
		days = $toNativeArray($kindString, ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]);
		daysBefore = $toNativeArray($kindInt32, [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365]);
		utcLoc = new Location.ptr("UTC", sliceType$1.nil, sliceType$2.nil, new $Int64(0, 0), new $Int64(0, 0), ptrType.nil);
		$pkg.UTC = utcLoc;
		$pkg.Local = localLoc;
		_r = syscall.Getenv("ZONEINFO", $BLOCKING); /* */ $s = 7; case 7: if (_r && _r.$blocking) { _r = _r(); }
		_tuple = _r; zoneinfo = _tuple[0];
		badData = errors.New("malformed time zone information");
		zoneDirs = new sliceType(["/usr/share/zoneinfo/", "/usr/share/lib/zoneinfo/", "/usr/lib/locale/TZ/", runtime.GOROOT() + "/lib/time/zoneinfo.zip"]);
		/* */ } return; } }; $init_time.$blocking = true; return $init_time;
	};
	return $pkg;
})();
$packages["os"] = (function() {
	var $pkg = {}, errors, js, io, runtime, sync, atomic, syscall, time, PathError, SyscallError, LinkError, File, file, dirInfo, FileInfo, FileMode, fileStat, sliceType, ptrType, sliceType$1, sliceType$2, ptrType$2, ptrType$3, ptrType$4, arrayType, ptrType$11, funcType$1, ptrType$12, ptrType$14, ptrType$15, errFinished, lstat, useSyscallwd, supportsCloseOnExec, runtime_args, init, NewSyscallError, IsNotExist, isNotExist, fixCount, sigpipe, syscallMode, NewFile, epipecheck, Lstat, basename, init$1, useSyscallwdDarwin, init$2, fileInfoFromStat, timespecToTime, init$3;
	errors = $packages["errors"];
	js = $packages["github.com/gopherjs/gopherjs/js"];
	io = $packages["io"];
	runtime = $packages["runtime"];
	sync = $packages["sync"];
	atomic = $packages["sync/atomic"];
	syscall = $packages["syscall"];
	time = $packages["time"];
	PathError = $pkg.PathError = $newType(0, $kindStruct, "os.PathError", "PathError", "os", function(Op_, Path_, Err_) {
		this.$val = this;
		this.Op = Op_ !== undefined ? Op_ : "";
		this.Path = Path_ !== undefined ? Path_ : "";
		this.Err = Err_ !== undefined ? Err_ : $ifaceNil;
	});
	SyscallError = $pkg.SyscallError = $newType(0, $kindStruct, "os.SyscallError", "SyscallError", "os", function(Syscall_, Err_) {
		this.$val = this;
		this.Syscall = Syscall_ !== undefined ? Syscall_ : "";
		this.Err = Err_ !== undefined ? Err_ : $ifaceNil;
	});
	LinkError = $pkg.LinkError = $newType(0, $kindStruct, "os.LinkError", "LinkError", "os", function(Op_, Old_, New_, Err_) {
		this.$val = this;
		this.Op = Op_ !== undefined ? Op_ : "";
		this.Old = Old_ !== undefined ? Old_ : "";
		this.New = New_ !== undefined ? New_ : "";
		this.Err = Err_ !== undefined ? Err_ : $ifaceNil;
	});
	File = $pkg.File = $newType(0, $kindStruct, "os.File", "File", "os", function(file_) {
		this.$val = this;
		this.file = file_ !== undefined ? file_ : ptrType$11.nil;
	});
	file = $pkg.file = $newType(0, $kindStruct, "os.file", "file", "os", function(fd_, name_, dirinfo_, nepipe_) {
		this.$val = this;
		this.fd = fd_ !== undefined ? fd_ : 0;
		this.name = name_ !== undefined ? name_ : "";
		this.dirinfo = dirinfo_ !== undefined ? dirinfo_ : ptrType.nil;
		this.nepipe = nepipe_ !== undefined ? nepipe_ : 0;
	});
	dirInfo = $pkg.dirInfo = $newType(0, $kindStruct, "os.dirInfo", "dirInfo", "os", function(buf_, nbuf_, bufp_) {
		this.$val = this;
		this.buf = buf_ !== undefined ? buf_ : sliceType$1.nil;
		this.nbuf = nbuf_ !== undefined ? nbuf_ : 0;
		this.bufp = bufp_ !== undefined ? bufp_ : 0;
	});
	FileInfo = $pkg.FileInfo = $newType(8, $kindInterface, "os.FileInfo", "FileInfo", "os", null);
	FileMode = $pkg.FileMode = $newType(4, $kindUint32, "os.FileMode", "FileMode", "os", null);
	fileStat = $pkg.fileStat = $newType(0, $kindStruct, "os.fileStat", "fileStat", "os", function(name_, size_, mode_, modTime_, sys_) {
		this.$val = this;
		this.name = name_ !== undefined ? name_ : "";
		this.size = size_ !== undefined ? size_ : new $Int64(0, 0);
		this.mode = mode_ !== undefined ? mode_ : 0;
		this.modTime = modTime_ !== undefined ? modTime_ : new time.Time.ptr();
		this.sys = sys_ !== undefined ? sys_ : $ifaceNil;
	});
	sliceType = $sliceType($String);
	ptrType = $ptrType(dirInfo);
	sliceType$1 = $sliceType($Uint8);
	sliceType$2 = $sliceType(FileInfo);
	ptrType$2 = $ptrType(File);
	ptrType$3 = $ptrType(PathError);
	ptrType$4 = $ptrType(LinkError);
	arrayType = $arrayType($Uint8, 32);
	ptrType$11 = $ptrType(file);
	funcType$1 = $funcType([ptrType$11], [$error], false);
	ptrType$12 = $ptrType($Int32);
	ptrType$14 = $ptrType(fileStat);
	ptrType$15 = $ptrType(SyscallError);
	runtime_args = function() {
		return $pkg.Args;
	};
	init = function() {
		var argv, i, process;
		process = $global.process;
		if (!(process === undefined)) {
			argv = process.argv;
			$pkg.Args = $makeSlice(sliceType, ($parseInt(argv.length) - 1 >> 0));
			i = 0;
			while (true) {
				if (!(i < ($parseInt(argv.length) - 1 >> 0))) { break; }
				(i < 0 || i >= $pkg.Args.$length) ? $throwRuntimeError("index out of range") : $pkg.Args.$array[$pkg.Args.$offset + i] = $internalize(argv[(i + 1 >> 0)], $String);
				i = i + (1) >> 0;
			}
		}
		if ($pkg.Args.$length === 0) {
			$pkg.Args = new sliceType(["?"]);
		}
	};
	File.ptr.prototype.readdirnames = function(n) {
		var _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, _tmp$6, _tmp$7, _tuple, _tuple$1, _tuple$2, d, err = $ifaceNil, errno, f, n, names = sliceType.nil, nb, nc, size;
		f = this;
		if (f.file.dirinfo === ptrType.nil) {
			f.file.dirinfo = new dirInfo.ptr();
			f.file.dirinfo.buf = $makeSlice(sliceType$1, 4096);
		}
		d = f.file.dirinfo;
		size = n;
		if (size <= 0) {
			size = 100;
			n = -1;
		}
		names = $makeSlice(sliceType, 0, size);
		while (true) {
			if (!(!((n === 0)))) { break; }
			if (d.bufp >= d.nbuf) {
				d.bufp = 0;
				errno = $ifaceNil;
				_tuple$1 = syscall.ReadDirent(f.file.fd, d.buf);
				_tuple = fixCount(_tuple$1[0], _tuple$1[1]); d.nbuf = _tuple[0]; errno = _tuple[1];
				if (!($interfaceIsEqual(errno, $ifaceNil))) {
					_tmp = names; _tmp$1 = NewSyscallError("readdirent", errno); names = _tmp; err = _tmp$1;
					return [names, err];
				}
				if (d.nbuf <= 0) {
					break;
				}
			}
			_tmp$2 = 0; _tmp$3 = 0; nb = _tmp$2; nc = _tmp$3;
			_tuple$2 = syscall.ParseDirent($subslice(d.buf, d.bufp, d.nbuf), n, names); nb = _tuple$2[0]; nc = _tuple$2[1]; names = _tuple$2[2];
			d.bufp = d.bufp + (nb) >> 0;
			n = n - (nc) >> 0;
		}
		if (n >= 0 && (names.$length === 0)) {
			_tmp$4 = names; _tmp$5 = io.EOF; names = _tmp$4; err = _tmp$5;
			return [names, err];
		}
		_tmp$6 = names; _tmp$7 = $ifaceNil; names = _tmp$6; err = _tmp$7;
		return [names, err];
	};
	File.prototype.readdirnames = function(n) { return this.$val.readdirnames(n); };
	File.ptr.prototype.Readdir = function(n) {
		var _tmp, _tmp$1, _tuple, err = $ifaceNil, f, fi = sliceType$2.nil, n;
		f = this;
		if (f === ptrType$2.nil) {
			_tmp = sliceType$2.nil; _tmp$1 = $pkg.ErrInvalid; fi = _tmp; err = _tmp$1;
			return [fi, err];
		}
		_tuple = f.readdir(n); fi = _tuple[0]; err = _tuple[1];
		return [fi, err];
	};
	File.prototype.Readdir = function(n) { return this.$val.Readdir(n); };
	File.ptr.prototype.Readdirnames = function(n) {
		var _tmp, _tmp$1, _tuple, err = $ifaceNil, f, n, names = sliceType.nil;
		f = this;
		if (f === ptrType$2.nil) {
			_tmp = sliceType.nil; _tmp$1 = $pkg.ErrInvalid; names = _tmp; err = _tmp$1;
			return [names, err];
		}
		_tuple = f.readdirnames(n); names = _tuple[0]; err = _tuple[1];
		return [names, err];
	};
	File.prototype.Readdirnames = function(n) { return this.$val.Readdirnames(n); };
	PathError.ptr.prototype.Error = function() {
		var e;
		e = this;
		return e.Op + " " + e.Path + ": " + e.Err.Error();
	};
	PathError.prototype.Error = function() { return this.$val.Error(); };
	SyscallError.ptr.prototype.Error = function() {
		var e;
		e = this;
		return e.Syscall + ": " + e.Err.Error();
	};
	SyscallError.prototype.Error = function() { return this.$val.Error(); };
	NewSyscallError = $pkg.NewSyscallError = function(syscall$1, err) {
		var err, syscall$1;
		if ($interfaceIsEqual(err, $ifaceNil)) {
			return $ifaceNil;
		}
		return new SyscallError.ptr(syscall$1, err);
	};
	IsNotExist = $pkg.IsNotExist = function(err) {
		var err;
		return isNotExist(err);
	};
	isNotExist = function(err) {
		var _ref, err, pe;
		_ref = err;
		if (_ref === $ifaceNil) {
			pe = _ref;
			return false;
		} else if ($assertType(_ref, ptrType$3, true)[1]) {
			pe = _ref.$val;
			err = pe.Err;
		} else if ($assertType(_ref, ptrType$4, true)[1]) {
			pe = _ref.$val;
			err = pe.Err;
		}
		return $interfaceIsEqual(err, new syscall.Errno(2)) || $interfaceIsEqual(err, $pkg.ErrNotExist);
	};
	File.ptr.prototype.Name = function() {
		var f;
		f = this;
		return f.file.name;
	};
	File.prototype.Name = function() { return this.$val.Name(); };
	LinkError.ptr.prototype.Error = function() {
		var e;
		e = this;
		return e.Op + " " + e.Old + " " + e.New + ": " + e.Err.Error();
	};
	LinkError.prototype.Error = function() { return this.$val.Error(); };
	File.ptr.prototype.Read = function(b) {
		var _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, _tuple, b, e, err = $ifaceNil, f, n = 0;
		f = this;
		if (f === ptrType$2.nil) {
			_tmp = 0; _tmp$1 = $pkg.ErrInvalid; n = _tmp; err = _tmp$1;
			return [n, err];
		}
		_tuple = f.read(b); n = _tuple[0]; e = _tuple[1];
		if (n < 0) {
			n = 0;
		}
		if ((n === 0) && b.$length > 0 && $interfaceIsEqual(e, $ifaceNil)) {
			_tmp$2 = 0; _tmp$3 = io.EOF; n = _tmp$2; err = _tmp$3;
			return [n, err];
		}
		if (!($interfaceIsEqual(e, $ifaceNil))) {
			err = new PathError.ptr("read", f.file.name, e);
		}
		_tmp$4 = n; _tmp$5 = err; n = _tmp$4; err = _tmp$5;
		return [n, err];
	};
	File.prototype.Read = function(b) { return this.$val.Read(b); };
	File.ptr.prototype.ReadAt = function(b, off) {
		var _tmp, _tmp$1, _tmp$2, _tmp$3, _tuple, b, e, err = $ifaceNil, f, m, n = 0, off, x;
		f = this;
		if (f === ptrType$2.nil) {
			_tmp = 0; _tmp$1 = $pkg.ErrInvalid; n = _tmp; err = _tmp$1;
			return [n, err];
		}
		while (true) {
			if (!(b.$length > 0)) { break; }
			_tuple = f.pread(b, off); m = _tuple[0]; e = _tuple[1];
			if ((m === 0) && $interfaceIsEqual(e, $ifaceNil)) {
				_tmp$2 = n; _tmp$3 = io.EOF; n = _tmp$2; err = _tmp$3;
				return [n, err];
			}
			if (!($interfaceIsEqual(e, $ifaceNil))) {
				err = new PathError.ptr("read", f.file.name, e);
				break;
			}
			n = n + (m) >> 0;
			b = $subslice(b, m);
			off = (x = new $Int64(0, m), new $Int64(off.$high + x.$high, off.$low + x.$low));
		}
		return [n, err];
	};
	File.prototype.ReadAt = function(b, off) { return this.$val.ReadAt(b, off); };
	File.ptr.prototype.Write = function(b) {
		var _tmp, _tmp$1, _tmp$2, _tmp$3, _tuple, b, e, err = $ifaceNil, f, n = 0;
		f = this;
		if (f === ptrType$2.nil) {
			_tmp = 0; _tmp$1 = $pkg.ErrInvalid; n = _tmp; err = _tmp$1;
			return [n, err];
		}
		_tuple = f.write(b); n = _tuple[0]; e = _tuple[1];
		if (n < 0) {
			n = 0;
		}
		if (!((n === b.$length))) {
			err = io.ErrShortWrite;
		}
		epipecheck(f, e);
		if (!($interfaceIsEqual(e, $ifaceNil))) {
			err = new PathError.ptr("write", f.file.name, e);
		}
		_tmp$2 = n; _tmp$3 = err; n = _tmp$2; err = _tmp$3;
		return [n, err];
	};
	File.prototype.Write = function(b) { return this.$val.Write(b); };
	File.ptr.prototype.WriteAt = function(b, off) {
		var _tmp, _tmp$1, _tuple, b, e, err = $ifaceNil, f, m, n = 0, off, x;
		f = this;
		if (f === ptrType$2.nil) {
			_tmp = 0; _tmp$1 = $pkg.ErrInvalid; n = _tmp; err = _tmp$1;
			return [n, err];
		}
		while (true) {
			if (!(b.$length > 0)) { break; }
			_tuple = f.pwrite(b, off); m = _tuple[0]; e = _tuple[1];
			if (!($interfaceIsEqual(e, $ifaceNil))) {
				err = new PathError.ptr("write", f.file.name, e);
				break;
			}
			n = n + (m) >> 0;
			b = $subslice(b, m);
			off = (x = new $Int64(0, m), new $Int64(off.$high + x.$high, off.$low + x.$low));
		}
		return [n, err];
	};
	File.prototype.WriteAt = function(b, off) { return this.$val.WriteAt(b, off); };
	File.ptr.prototype.Seek = function(offset, whence) {
		var _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, _tuple, e, err = $ifaceNil, f, offset, r, ret = new $Int64(0, 0), whence;
		f = this;
		if (f === ptrType$2.nil) {
			_tmp = new $Int64(0, 0); _tmp$1 = $pkg.ErrInvalid; ret = _tmp; err = _tmp$1;
			return [ret, err];
		}
		_tuple = f.seek(offset, whence); r = _tuple[0]; e = _tuple[1];
		if ($interfaceIsEqual(e, $ifaceNil) && !(f.file.dirinfo === ptrType.nil) && !((r.$high === 0 && r.$low === 0))) {
			e = new syscall.Errno(21);
		}
		if (!($interfaceIsEqual(e, $ifaceNil))) {
			_tmp$2 = new $Int64(0, 0); _tmp$3 = new PathError.ptr("seek", f.file.name, e); ret = _tmp$2; err = _tmp$3;
			return [ret, err];
		}
		_tmp$4 = r; _tmp$5 = $ifaceNil; ret = _tmp$4; err = _tmp$5;
		return [ret, err];
	};
	File.prototype.Seek = function(offset, whence) { return this.$val.Seek(offset, whence); };
	File.ptr.prototype.WriteString = function(s) {
		var _tmp, _tmp$1, _tuple, err = $ifaceNil, f, ret = 0, s;
		f = this;
		if (f === ptrType$2.nil) {
			_tmp = 0; _tmp$1 = $pkg.ErrInvalid; ret = _tmp; err = _tmp$1;
			return [ret, err];
		}
		_tuple = f.Write(new sliceType$1($stringToBytes(s))); ret = _tuple[0]; err = _tuple[1];
		return [ret, err];
	};
	File.prototype.WriteString = function(s) { return this.$val.WriteString(s); };
	File.ptr.prototype.Chdir = function() {
		var e, f;
		f = this;
		if (f === ptrType$2.nil) {
			return $pkg.ErrInvalid;
		}
		e = syscall.Fchdir(f.file.fd);
		if (!($interfaceIsEqual(e, $ifaceNil))) {
			return new PathError.ptr("chdir", f.file.name, e);
		}
		return $ifaceNil;
	};
	File.prototype.Chdir = function() { return this.$val.Chdir(); };
	fixCount = function(n, err) {
		var err, n;
		if (n < 0) {
			n = 0;
		}
		return [n, err];
	};
	sigpipe = function() {
		$panic("Native function not implemented: os.sigpipe");
	};
	syscallMode = function(i) {
		var i, o = 0;
		o = (o | ((new FileMode(i).Perm() >>> 0))) >>> 0;
		if (!((((i & 8388608) >>> 0) === 0))) {
			o = (o | (2048)) >>> 0;
		}
		if (!((((i & 4194304) >>> 0) === 0))) {
			o = (o | (1024)) >>> 0;
		}
		if (!((((i & 1048576) >>> 0) === 0))) {
			o = (o | (512)) >>> 0;
		}
		return o;
	};
	File.ptr.prototype.Chmod = function(mode) {
		var e, f, mode;
		f = this;
		if (f === ptrType$2.nil) {
			return $pkg.ErrInvalid;
		}
		e = syscall.Fchmod(f.file.fd, syscallMode(mode));
		if (!($interfaceIsEqual(e, $ifaceNil))) {
			return new PathError.ptr("chmod", f.file.name, e);
		}
		return $ifaceNil;
	};
	File.prototype.Chmod = function(mode) { return this.$val.Chmod(mode); };
	File.ptr.prototype.Chown = function(uid, gid) {
		var e, f, gid, uid;
		f = this;
		if (f === ptrType$2.nil) {
			return $pkg.ErrInvalid;
		}
		e = syscall.Fchown(f.file.fd, uid, gid);
		if (!($interfaceIsEqual(e, $ifaceNil))) {
			return new PathError.ptr("chown", f.file.name, e);
		}
		return $ifaceNil;
	};
	File.prototype.Chown = function(uid, gid) { return this.$val.Chown(uid, gid); };
	File.ptr.prototype.Truncate = function(size) {
		var e, f, size;
		f = this;
		if (f === ptrType$2.nil) {
			return $pkg.ErrInvalid;
		}
		e = syscall.Ftruncate(f.file.fd, size);
		if (!($interfaceIsEqual(e, $ifaceNil))) {
			return new PathError.ptr("truncate", f.file.name, e);
		}
		return $ifaceNil;
	};
	File.prototype.Truncate = function(size) { return this.$val.Truncate(size); };
	File.ptr.prototype.Sync = function() {
		var e, err = $ifaceNil, f;
		f = this;
		if (f === ptrType$2.nil) {
			err = $pkg.ErrInvalid;
			return err;
		}
		e = syscall.Fsync(f.file.fd);
		if (!($interfaceIsEqual(e, $ifaceNil))) {
			err = NewSyscallError("fsync", e);
			return err;
		}
		err = $ifaceNil;
		return err;
	};
	File.prototype.Sync = function() { return this.$val.Sync(); };
	File.ptr.prototype.Fd = function() {
		var f;
		f = this;
		if (f === ptrType$2.nil) {
			return 4294967295;
		}
		return (f.file.fd >>> 0);
	};
	File.prototype.Fd = function() { return this.$val.Fd(); };
	NewFile = $pkg.NewFile = function(fd, name) {
		var f, fd, fdi, name;
		fdi = (fd >> 0);
		if (fdi < 0) {
			return ptrType$2.nil;
		}
		f = new File.ptr(new file.ptr(fdi, name, ptrType.nil, 0));
		runtime.SetFinalizer(f.file, new funcType$1($methodExpr(ptrType$11.prototype.close)));
		return f;
	};
	epipecheck = function(file$1, e) {
		var e, file$1;
		if ($interfaceIsEqual(e, new syscall.Errno(32))) {
			if (atomic.AddInt32(new ptrType$12(function() { return this.$target.file.nepipe; }, function($v) { this.$target.file.nepipe = $v; }, file$1), 1) >= 10) {
				sigpipe();
			}
		} else {
			atomic.StoreInt32(new ptrType$12(function() { return this.$target.file.nepipe; }, function($v) { this.$target.file.nepipe = $v; }, file$1), 0);
		}
	};
	File.ptr.prototype.Close = function() {
		var f;
		f = this;
		if (f === ptrType$2.nil) {
			return $pkg.ErrInvalid;
		}
		return f.file.close();
	};
	File.prototype.Close = function() { return this.$val.Close(); };
	file.ptr.prototype.close = function() {
		var e, err, file$1;
		file$1 = this;
		if (file$1 === ptrType$11.nil || file$1.fd < 0) {
			return new syscall.Errno(22);
		}
		err = $ifaceNil;
		e = syscall.Close(file$1.fd);
		if (!($interfaceIsEqual(e, $ifaceNil))) {
			err = new PathError.ptr("close", file$1.name, e);
		}
		file$1.fd = -1;
		runtime.SetFinalizer(file$1, $ifaceNil);
		return err;
	};
	file.prototype.close = function() { return this.$val.close(); };
	File.ptr.prototype.Stat = function() {
		var _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, err = $ifaceNil, f, fi = $ifaceNil, stat;
		f = this;
		if (f === ptrType$2.nil) {
			_tmp = $ifaceNil; _tmp$1 = $pkg.ErrInvalid; fi = _tmp; err = _tmp$1;
			return [fi, err];
		}
		stat = $clone(new syscall.Stat_t.ptr(), syscall.Stat_t);
		err = syscall.Fstat(f.file.fd, stat);
		if (!($interfaceIsEqual(err, $ifaceNil))) {
			_tmp$2 = $ifaceNil; _tmp$3 = new PathError.ptr("stat", f.file.name, err); fi = _tmp$2; err = _tmp$3;
			return [fi, err];
		}
		_tmp$4 = fileInfoFromStat(stat, f.file.name); _tmp$5 = $ifaceNil; fi = _tmp$4; err = _tmp$5;
		return [fi, err];
	};
	File.prototype.Stat = function() { return this.$val.Stat(); };
	Lstat = $pkg.Lstat = function(name) {
		var _tmp, _tmp$1, _tmp$2, _tmp$3, err = $ifaceNil, fi = $ifaceNil, name, stat;
		stat = $clone(new syscall.Stat_t.ptr(), syscall.Stat_t);
		err = syscall.Lstat(name, stat);
		if (!($interfaceIsEqual(err, $ifaceNil))) {
			_tmp = $ifaceNil; _tmp$1 = new PathError.ptr("lstat", name, err); fi = _tmp; err = _tmp$1;
			return [fi, err];
		}
		_tmp$2 = fileInfoFromStat(stat, name); _tmp$3 = $ifaceNil; fi = _tmp$2; err = _tmp$3;
		return [fi, err];
	};
	File.ptr.prototype.readdir = function(n) {
		var _i, _ref, _tmp, _tmp$1, _tmp$2, _tmp$3, _tuple, _tuple$1, dirname, err = $ifaceNil, f, fi = sliceType$2.nil, filename, fip, lerr, n, names;
		f = this;
		dirname = f.file.name;
		if (dirname === "") {
			dirname = ".";
		}
		_tuple = f.Readdirnames(n); names = _tuple[0]; err = _tuple[1];
		fi = $makeSlice(sliceType$2, 0, names.$length);
		_ref = names;
		_i = 0;
		while (true) {
			if (!(_i < _ref.$length)) { break; }
			filename = ((_i < 0 || _i >= _ref.$length) ? $throwRuntimeError("index out of range") : _ref.$array[_ref.$offset + _i]);
			_tuple$1 = lstat(dirname + "/" + filename); fip = _tuple$1[0]; lerr = _tuple$1[1];
			if (IsNotExist(lerr)) {
				_i++;
				continue;
			}
			if (!($interfaceIsEqual(lerr, $ifaceNil))) {
				_tmp = fi; _tmp$1 = lerr; fi = _tmp; err = _tmp$1;
				return [fi, err];
			}
			fi = $append(fi, fip);
			_i++;
		}
		_tmp$2 = fi; _tmp$3 = err; fi = _tmp$2; err = _tmp$3;
		return [fi, err];
	};
	File.prototype.readdir = function(n) { return this.$val.readdir(n); };
	File.ptr.prototype.read = function(b) {
		var _tuple, _tuple$1, b, err = $ifaceNil, f, n = 0;
		f = this;
		if (true && b.$length > 1073741824) {
			b = $subslice(b, 0, 1073741824);
		}
		_tuple$1 = syscall.Read(f.file.fd, b);
		_tuple = fixCount(_tuple$1[0], _tuple$1[1]); n = _tuple[0]; err = _tuple[1];
		return [n, err];
	};
	File.prototype.read = function(b) { return this.$val.read(b); };
	File.ptr.prototype.pread = function(b, off) {
		var _tuple, _tuple$1, b, err = $ifaceNil, f, n = 0, off;
		f = this;
		if (true && b.$length > 1073741824) {
			b = $subslice(b, 0, 1073741824);
		}
		_tuple$1 = syscall.Pread(f.file.fd, b, off);
		_tuple = fixCount(_tuple$1[0], _tuple$1[1]); n = _tuple[0]; err = _tuple[1];
		return [n, err];
	};
	File.prototype.pread = function(b, off) { return this.$val.pread(b, off); };
	File.ptr.prototype.write = function(b) {
		var _tmp, _tmp$1, _tuple, _tuple$1, b, bcap, err = $ifaceNil, err$1, f, m, n = 0;
		f = this;
		while (true) {
			if (!(true)) { break; }
			bcap = b;
			if (true && bcap.$length > 1073741824) {
				bcap = $subslice(bcap, 0, 1073741824);
			}
			_tuple$1 = syscall.Write(f.file.fd, bcap);
			_tuple = fixCount(_tuple$1[0], _tuple$1[1]); m = _tuple[0]; err$1 = _tuple[1];
			n = n + (m) >> 0;
			if (0 < m && m < bcap.$length || $interfaceIsEqual(err$1, new syscall.Errno(4))) {
				b = $subslice(b, m);
				continue;
			}
			if (true && !((bcap.$length === b.$length)) && $interfaceIsEqual(err$1, $ifaceNil)) {
				b = $subslice(b, m);
				continue;
			}
			_tmp = n; _tmp$1 = err$1; n = _tmp; err = _tmp$1;
			return [n, err];
		}
	};
	File.prototype.write = function(b) { return this.$val.write(b); };
	File.ptr.prototype.pwrite = function(b, off) {
		var _tuple, _tuple$1, b, err = $ifaceNil, f, n = 0, off;
		f = this;
		if (true && b.$length > 1073741824) {
			b = $subslice(b, 0, 1073741824);
		}
		_tuple$1 = syscall.Pwrite(f.file.fd, b, off);
		_tuple = fixCount(_tuple$1[0], _tuple$1[1]); n = _tuple[0]; err = _tuple[1];
		return [n, err];
	};
	File.prototype.pwrite = function(b, off) { return this.$val.pwrite(b, off); };
	File.ptr.prototype.seek = function(offset, whence) {
		var _tuple, err = $ifaceNil, f, offset, ret = new $Int64(0, 0), whence;
		f = this;
		_tuple = syscall.Seek(f.file.fd, offset, whence); ret = _tuple[0]; err = _tuple[1];
		return [ret, err];
	};
	File.prototype.seek = function(offset, whence) { return this.$val.seek(offset, whence); };
	basename = function(name) {
		var i, name;
		i = name.length - 1 >> 0;
		while (true) {
			if (!(i > 0 && (name.charCodeAt(i) === 47))) { break; }
			name = name.substring(0, i);
			i = i - (1) >> 0;
		}
		i = i - (1) >> 0;
		while (true) {
			if (!(i >= 0)) { break; }
			if (name.charCodeAt(i) === 47) {
				name = name.substring((i + 1 >> 0));
				break;
			}
			i = i - (1) >> 0;
		}
		return name;
	};
	init$1 = function() {
		useSyscallwd = useSyscallwdDarwin;
	};
	useSyscallwdDarwin = function(err) {
		var err;
		return !($interfaceIsEqual(err, new syscall.Errno(45)));
	};
	init$2 = function() {
		$pkg.Args = runtime_args();
	};
	fileInfoFromStat = function(st, name) {
		var _ref, fs, name, st;
		fs = new fileStat.ptr(basename(name), st.Size, 0, $clone(timespecToTime(st.Mtimespec), time.Time), st);
		fs.mode = (((st.Mode & 511) >>> 0) >>> 0);
		_ref = (st.Mode & 61440) >>> 0;
		if (_ref === 24576 || _ref === 57344) {
			fs.mode = (fs.mode | (67108864)) >>> 0;
		} else if (_ref === 8192) {
			fs.mode = (fs.mode | (69206016)) >>> 0;
		} else if (_ref === 16384) {
			fs.mode = (fs.mode | (2147483648)) >>> 0;
		} else if (_ref === 4096) {
			fs.mode = (fs.mode | (33554432)) >>> 0;
		} else if (_ref === 40960) {
			fs.mode = (fs.mode | (134217728)) >>> 0;
		} else if (_ref === 32768) {
		} else if (_ref === 49152) {
			fs.mode = (fs.mode | (16777216)) >>> 0;
		}
		if (!((((st.Mode & 1024) >>> 0) === 0))) {
			fs.mode = (fs.mode | (4194304)) >>> 0;
		}
		if (!((((st.Mode & 2048) >>> 0) === 0))) {
			fs.mode = (fs.mode | (8388608)) >>> 0;
		}
		if (!((((st.Mode & 512) >>> 0) === 0))) {
			fs.mode = (fs.mode | (1048576)) >>> 0;
		}
		return fs;
	};
	timespecToTime = function(ts) {
		var ts;
		ts = $clone(ts, syscall.Timespec);
		return time.Unix(ts.Sec, ts.Nsec);
	};
	init$3 = function() {
		var _i, _ref, _rune, _tuple, err, i, osver;
		_tuple = syscall.Sysctl("kern.osrelease"); osver = _tuple[0]; err = _tuple[1];
		if (!($interfaceIsEqual(err, $ifaceNil))) {
			return;
		}
		i = 0;
		_ref = osver;
		_i = 0;
		while (true) {
			if (!(_i < _ref.length)) { break; }
			_rune = $decodeRune(_ref, _i);
			i = _i;
			if (!((osver.charCodeAt(i) === 46))) {
				_i += _rune[1];
				continue;
			}
			_i += _rune[1];
		}
		if (i > 2 || (i === 2) && osver.charCodeAt(0) >= 49 && osver.charCodeAt(1) >= 49) {
			supportsCloseOnExec = true;
		}
	};
	FileMode.prototype.String = function() {
		var _i, _i$1, _ref, _ref$1, _rune, _rune$1, buf, c, c$1, i, i$1, m, w, y, y$1;
		m = this.$val;
		buf = $clone(arrayType.zero(), arrayType);
		w = 0;
		_ref = "dalTLDpSugct";
		_i = 0;
		while (true) {
			if (!(_i < _ref.length)) { break; }
			_rune = $decodeRune(_ref, _i);
			i = _i;
			c = _rune[0];
			if (!((((m & (((y = ((31 - i >> 0) >>> 0), y < 32 ? (1 << y) : 0) >>> 0))) >>> 0) === 0))) {
				(w < 0 || w >= buf.length) ? $throwRuntimeError("index out of range") : buf[w] = (c << 24 >>> 24);
				w = w + (1) >> 0;
			}
			_i += _rune[1];
		}
		if (w === 0) {
			(w < 0 || w >= buf.length) ? $throwRuntimeError("index out of range") : buf[w] = 45;
			w = w + (1) >> 0;
		}
		_ref$1 = "rwxrwxrwx";
		_i$1 = 0;
		while (true) {
			if (!(_i$1 < _ref$1.length)) { break; }
			_rune$1 = $decodeRune(_ref$1, _i$1);
			i$1 = _i$1;
			c$1 = _rune$1[0];
			if (!((((m & (((y$1 = ((8 - i$1 >> 0) >>> 0), y$1 < 32 ? (1 << y$1) : 0) >>> 0))) >>> 0) === 0))) {
				(w < 0 || w >= buf.length) ? $throwRuntimeError("index out of range") : buf[w] = (c$1 << 24 >>> 24);
			} else {
				(w < 0 || w >= buf.length) ? $throwRuntimeError("index out of range") : buf[w] = 45;
			}
			w = w + (1) >> 0;
			_i$1 += _rune$1[1];
		}
		return $bytesToString($subslice(new sliceType$1(buf), 0, w));
	};
	$ptrType(FileMode).prototype.String = function() { return new FileMode(this.$get()).String(); };
	FileMode.prototype.IsDir = function() {
		var m;
		m = this.$val;
		return !((((m & 2147483648) >>> 0) === 0));
	};
	$ptrType(FileMode).prototype.IsDir = function() { return new FileMode(this.$get()).IsDir(); };
	FileMode.prototype.IsRegular = function() {
		var m;
		m = this.$val;
		return ((m & 2399141888) >>> 0) === 0;
	};
	$ptrType(FileMode).prototype.IsRegular = function() { return new FileMode(this.$get()).IsRegular(); };
	FileMode.prototype.Perm = function() {
		var m;
		m = this.$val;
		return (m & 511) >>> 0;
	};
	$ptrType(FileMode).prototype.Perm = function() { return new FileMode(this.$get()).Perm(); };
	fileStat.ptr.prototype.Name = function() {
		var fs;
		fs = this;
		return fs.name;
	};
	fileStat.prototype.Name = function() { return this.$val.Name(); };
	fileStat.ptr.prototype.IsDir = function() {
		var fs;
		fs = this;
		return new FileMode(fs.Mode()).IsDir();
	};
	fileStat.prototype.IsDir = function() { return this.$val.IsDir(); };
	fileStat.ptr.prototype.Size = function() {
		var fs;
		fs = this;
		return fs.size;
	};
	fileStat.prototype.Size = function() { return this.$val.Size(); };
	fileStat.ptr.prototype.Mode = function() {
		var fs;
		fs = this;
		return fs.mode;
	};
	fileStat.prototype.Mode = function() { return this.$val.Mode(); };
	fileStat.ptr.prototype.ModTime = function() {
		var fs;
		fs = this;
		return fs.modTime;
	};
	fileStat.prototype.ModTime = function() { return this.$val.ModTime(); };
	fileStat.ptr.prototype.Sys = function() {
		var fs;
		fs = this;
		return fs.sys;
	};
	fileStat.prototype.Sys = function() { return this.$val.Sys(); };
	ptrType$3.methods = [{prop: "Error", name: "Error", pkg: "", typ: $funcType([], [$String], false)}];
	ptrType$15.methods = [{prop: "Error", name: "Error", pkg: "", typ: $funcType([], [$String], false)}];
	ptrType$4.methods = [{prop: "Error", name: "Error", pkg: "", typ: $funcType([], [$String], false)}];
	ptrType$2.methods = [{prop: "readdirnames", name: "readdirnames", pkg: "os", typ: $funcType([$Int], [sliceType, $error], false)}, {prop: "Readdir", name: "Readdir", pkg: "", typ: $funcType([$Int], [sliceType$2, $error], false)}, {prop: "Readdirnames", name: "Readdirnames", pkg: "", typ: $funcType([$Int], [sliceType, $error], false)}, {prop: "Name", name: "Name", pkg: "", typ: $funcType([], [$String], false)}, {prop: "Read", name: "Read", pkg: "", typ: $funcType([sliceType$1], [$Int, $error], false)}, {prop: "ReadAt", name: "ReadAt", pkg: "", typ: $funcType([sliceType$1, $Int64], [$Int, $error], false)}, {prop: "Write", name: "Write", pkg: "", typ: $funcType([sliceType$1], [$Int, $error], false)}, {prop: "WriteAt", name: "WriteAt", pkg: "", typ: $funcType([sliceType$1, $Int64], [$Int, $error], false)}, {prop: "Seek", name: "Seek", pkg: "", typ: $funcType([$Int64, $Int], [$Int64, $error], false)}, {prop: "WriteString", name: "WriteString", pkg: "", typ: $funcType([$String], [$Int, $error], false)}, {prop: "Chdir", name: "Chdir", pkg: "", typ: $funcType([], [$error], false)}, {prop: "Chmod", name: "Chmod", pkg: "", typ: $funcType([FileMode], [$error], false)}, {prop: "Chown", name: "Chown", pkg: "", typ: $funcType([$Int, $Int], [$error], false)}, {prop: "Truncate", name: "Truncate", pkg: "", typ: $funcType([$Int64], [$error], false)}, {prop: "Sync", name: "Sync", pkg: "", typ: $funcType([], [$error], false)}, {prop: "Fd", name: "Fd", pkg: "", typ: $funcType([], [$Uintptr], false)}, {prop: "Close", name: "Close", pkg: "", typ: $funcType([], [$error], false)}, {prop: "Stat", name: "Stat", pkg: "", typ: $funcType([], [FileInfo, $error], false)}, {prop: "readdir", name: "readdir", pkg: "os", typ: $funcType([$Int], [sliceType$2, $error], false)}, {prop: "read", name: "read", pkg: "os", typ: $funcType([sliceType$1], [$Int, $error], false)}, {prop: "pread", name: "pread", pkg: "os", typ: $funcType([sliceType$1, $Int64], [$Int, $error], false)}, {prop: "write", name: "write", pkg: "os", typ: $funcType([sliceType$1], [$Int, $error], false)}, {prop: "pwrite", name: "pwrite", pkg: "os", typ: $funcType([sliceType$1, $Int64], [$Int, $error], false)}, {prop: "seek", name: "seek", pkg: "os", typ: $funcType([$Int64, $Int], [$Int64, $error], false)}];
	ptrType$11.methods = [{prop: "close", name: "close", pkg: "os", typ: $funcType([], [$error], false)}];
	FileMode.methods = [{prop: "String", name: "String", pkg: "", typ: $funcType([], [$String], false)}, {prop: "IsDir", name: "IsDir", pkg: "", typ: $funcType([], [$Bool], false)}, {prop: "IsRegular", name: "IsRegular", pkg: "", typ: $funcType([], [$Bool], false)}, {prop: "Perm", name: "Perm", pkg: "", typ: $funcType([], [FileMode], false)}];
	ptrType$14.methods = [{prop: "Name", name: "Name", pkg: "", typ: $funcType([], [$String], false)}, {prop: "IsDir", name: "IsDir", pkg: "", typ: $funcType([], [$Bool], false)}, {prop: "Size", name: "Size", pkg: "", typ: $funcType([], [$Int64], false)}, {prop: "Mode", name: "Mode", pkg: "", typ: $funcType([], [FileMode], false)}, {prop: "ModTime", name: "ModTime", pkg: "", typ: $funcType([], [time.Time], false)}, {prop: "Sys", name: "Sys", pkg: "", typ: $funcType([], [$emptyInterface], false)}];
	PathError.init([{prop: "Op", name: "Op", pkg: "", typ: $String, tag: ""}, {prop: "Path", name: "Path", pkg: "", typ: $String, tag: ""}, {prop: "Err", name: "Err", pkg: "", typ: $error, tag: ""}]);
	SyscallError.init([{prop: "Syscall", name: "Syscall", pkg: "", typ: $String, tag: ""}, {prop: "Err", name: "Err", pkg: "", typ: $error, tag: ""}]);
	LinkError.init([{prop: "Op", name: "Op", pkg: "", typ: $String, tag: ""}, {prop: "Old", name: "Old", pkg: "", typ: $String, tag: ""}, {prop: "New", name: "New", pkg: "", typ: $String, tag: ""}, {prop: "Err", name: "Err", pkg: "", typ: $error, tag: ""}]);
	File.init([{prop: "file", name: "", pkg: "os", typ: ptrType$11, tag: ""}]);
	file.init([{prop: "fd", name: "fd", pkg: "os", typ: $Int, tag: ""}, {prop: "name", name: "name", pkg: "os", typ: $String, tag: ""}, {prop: "dirinfo", name: "dirinfo", pkg: "os", typ: ptrType, tag: ""}, {prop: "nepipe", name: "nepipe", pkg: "os", typ: $Int32, tag: ""}]);
	dirInfo.init([{prop: "buf", name: "buf", pkg: "os", typ: sliceType$1, tag: ""}, {prop: "nbuf", name: "nbuf", pkg: "os", typ: $Int, tag: ""}, {prop: "bufp", name: "bufp", pkg: "os", typ: $Int, tag: ""}]);
	FileInfo.init([{prop: "IsDir", name: "IsDir", pkg: "", typ: $funcType([], [$Bool], false)}, {prop: "ModTime", name: "ModTime", pkg: "", typ: $funcType([], [time.Time], false)}, {prop: "Mode", name: "Mode", pkg: "", typ: $funcType([], [FileMode], false)}, {prop: "Name", name: "Name", pkg: "", typ: $funcType([], [$String], false)}, {prop: "Size", name: "Size", pkg: "", typ: $funcType([], [$Int64], false)}, {prop: "Sys", name: "Sys", pkg: "", typ: $funcType([], [$emptyInterface], false)}]);
	fileStat.init([{prop: "name", name: "name", pkg: "os", typ: $String, tag: ""}, {prop: "size", name: "size", pkg: "os", typ: $Int64, tag: ""}, {prop: "mode", name: "mode", pkg: "os", typ: FileMode, tag: ""}, {prop: "modTime", name: "modTime", pkg: "os", typ: time.Time, tag: ""}, {prop: "sys", name: "sys", pkg: "os", typ: $emptyInterface, tag: ""}]);
	$pkg.$init = function() {
		$pkg.$init = function() {};
		/* */ var $r, $s = 0; var $init_os = function() { while (true) { switch ($s) { case 0:
		$r = errors.$init($BLOCKING); /* */ $s = 1; case 1: if ($r && $r.$blocking) { $r = $r(); }
		$r = js.$init($BLOCKING); /* */ $s = 2; case 2: if ($r && $r.$blocking) { $r = $r(); }
		$r = io.$init($BLOCKING); /* */ $s = 3; case 3: if ($r && $r.$blocking) { $r = $r(); }
		$r = runtime.$init($BLOCKING); /* */ $s = 4; case 4: if ($r && $r.$blocking) { $r = $r(); }
		$r = sync.$init($BLOCKING); /* */ $s = 5; case 5: if ($r && $r.$blocking) { $r = $r(); }
		$r = atomic.$init($BLOCKING); /* */ $s = 6; case 6: if ($r && $r.$blocking) { $r = $r(); }
		$r = syscall.$init($BLOCKING); /* */ $s = 7; case 7: if ($r && $r.$blocking) { $r = $r(); }
		$r = time.$init($BLOCKING); /* */ $s = 8; case 8: if ($r && $r.$blocking) { $r = $r(); }
		$pkg.Args = sliceType.nil;
		supportsCloseOnExec = false;
		$pkg.ErrInvalid = errors.New("invalid argument");
		$pkg.ErrPermission = errors.New("permission denied");
		$pkg.ErrExist = errors.New("file already exists");
		$pkg.ErrNotExist = errors.New("file does not exist");
		errFinished = errors.New("os: process already finished");
		$pkg.Stdin = NewFile((syscall.Stdin >>> 0), "/dev/stdin");
		$pkg.Stdout = NewFile((syscall.Stdout >>> 0), "/dev/stdout");
		$pkg.Stderr = NewFile((syscall.Stderr >>> 0), "/dev/stderr");
		useSyscallwd = (function(param) {
			var param;
			return true;
		});
		lstat = Lstat;
		init();
		init$1();
		init$2();
		init$3();
		/* */ } return; } }; $init_os.$blocking = true; return $init_os;
	};
	return $pkg;
})();
$packages["strconv"] = (function() {
	var $pkg = {}, errors, math, utf8, decimal, leftCheat, extFloat, floatInfo, decimalSlice, sliceType$3, sliceType$4, sliceType$5, sliceType$6, arrayType, arrayType$1, ptrType$1, arrayType$2, arrayType$3, arrayType$4, arrayType$5, arrayType$6, ptrType$2, ptrType$3, ptrType$4, optimize, leftcheats, smallPowersOfTen, powersOfTen, uint64pow10, float32info, float64info, isPrint16, isNotPrint16, isPrint32, isNotPrint32, shifts, digitZero, trim, rightShift, prefixIsLessThan, leftShift, shouldRoundUp, frexp10Many, adjustLastDigitFixed, adjustLastDigit, AppendFloat, genericFtoa, bigFtoa, formatDigits, roundShortest, fmtE, fmtF, fmtB, max, FormatInt, Itoa, formatBits, quoteWith, Quote, QuoteToASCII, QuoteRune, AppendQuoteRune, QuoteRuneToASCII, AppendQuoteRuneToASCII, CanBackquote, unhex, UnquoteChar, Unquote, contains, bsearch16, bsearch32, IsPrint;
	errors = $packages["errors"];
	math = $packages["math"];
	utf8 = $packages["unicode/utf8"];
	decimal = $pkg.decimal = $newType(0, $kindStruct, "strconv.decimal", "decimal", "strconv", function(d_, nd_, dp_, neg_, trunc_) {
		this.$val = this;
		this.d = d_ !== undefined ? d_ : arrayType$6.zero();
		this.nd = nd_ !== undefined ? nd_ : 0;
		this.dp = dp_ !== undefined ? dp_ : 0;
		this.neg = neg_ !== undefined ? neg_ : false;
		this.trunc = trunc_ !== undefined ? trunc_ : false;
	});
	leftCheat = $pkg.leftCheat = $newType(0, $kindStruct, "strconv.leftCheat", "leftCheat", "strconv", function(delta_, cutoff_) {
		this.$val = this;
		this.delta = delta_ !== undefined ? delta_ : 0;
		this.cutoff = cutoff_ !== undefined ? cutoff_ : "";
	});
	extFloat = $pkg.extFloat = $newType(0, $kindStruct, "strconv.extFloat", "extFloat", "strconv", function(mant_, exp_, neg_) {
		this.$val = this;
		this.mant = mant_ !== undefined ? mant_ : new $Uint64(0, 0);
		this.exp = exp_ !== undefined ? exp_ : 0;
		this.neg = neg_ !== undefined ? neg_ : false;
	});
	floatInfo = $pkg.floatInfo = $newType(0, $kindStruct, "strconv.floatInfo", "floatInfo", "strconv", function(mantbits_, expbits_, bias_) {
		this.$val = this;
		this.mantbits = mantbits_ !== undefined ? mantbits_ : 0;
		this.expbits = expbits_ !== undefined ? expbits_ : 0;
		this.bias = bias_ !== undefined ? bias_ : 0;
	});
	decimalSlice = $pkg.decimalSlice = $newType(0, $kindStruct, "strconv.decimalSlice", "decimalSlice", "strconv", function(d_, nd_, dp_, neg_) {
		this.$val = this;
		this.d = d_ !== undefined ? d_ : sliceType$6.nil;
		this.nd = nd_ !== undefined ? nd_ : 0;
		this.dp = dp_ !== undefined ? dp_ : 0;
		this.neg = neg_ !== undefined ? neg_ : false;
	});
	sliceType$3 = $sliceType(leftCheat);
	sliceType$4 = $sliceType($Uint16);
	sliceType$5 = $sliceType($Uint32);
	sliceType$6 = $sliceType($Uint8);
	arrayType = $arrayType($Uint8, 24);
	arrayType$1 = $arrayType($Uint8, 32);
	ptrType$1 = $ptrType(floatInfo);
	arrayType$2 = $arrayType($Uint8, 3);
	arrayType$3 = $arrayType($Uint8, 50);
	arrayType$4 = $arrayType($Uint8, 65);
	arrayType$5 = $arrayType($Uint8, 4);
	arrayType$6 = $arrayType($Uint8, 800);
	ptrType$2 = $ptrType(decimal);
	ptrType$3 = $ptrType(decimalSlice);
	ptrType$4 = $ptrType(extFloat);
	decimal.ptr.prototype.String = function() {
		var a, buf, n, w;
		a = this;
		n = 10 + a.nd >> 0;
		if (a.dp > 0) {
			n = n + (a.dp) >> 0;
		}
		if (a.dp < 0) {
			n = n + (-a.dp) >> 0;
		}
		buf = $makeSlice(sliceType$6, n);
		w = 0;
		if (a.nd === 0) {
			return "0";
		} else if (a.dp <= 0) {
			(w < 0 || w >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + w] = 48;
			w = w + (1) >> 0;
			(w < 0 || w >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + w] = 46;
			w = w + (1) >> 0;
			w = w + (digitZero($subslice(buf, w, (w + -a.dp >> 0)))) >> 0;
			w = w + ($copySlice($subslice(buf, w), $subslice(new sliceType$6(a.d), 0, a.nd))) >> 0;
		} else if (a.dp < a.nd) {
			w = w + ($copySlice($subslice(buf, w), $subslice(new sliceType$6(a.d), 0, a.dp))) >> 0;
			(w < 0 || w >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + w] = 46;
			w = w + (1) >> 0;
			w = w + ($copySlice($subslice(buf, w), $subslice(new sliceType$6(a.d), a.dp, a.nd))) >> 0;
		} else {
			w = w + ($copySlice($subslice(buf, w), $subslice(new sliceType$6(a.d), 0, a.nd))) >> 0;
			w = w + (digitZero($subslice(buf, w, ((w + a.dp >> 0) - a.nd >> 0)))) >> 0;
		}
		return $bytesToString($subslice(buf, 0, w));
	};
	decimal.prototype.String = function() { return this.$val.String(); };
	digitZero = function(dst) {
		var _i, _ref, dst, i;
		_ref = dst;
		_i = 0;
		while (true) {
			if (!(_i < _ref.$length)) { break; }
			i = _i;
			(i < 0 || i >= dst.$length) ? $throwRuntimeError("index out of range") : dst.$array[dst.$offset + i] = 48;
			_i++;
		}
		return dst.$length;
	};
	trim = function(a) {
		var a, x, x$1;
		while (true) {
			if (!(a.nd > 0 && ((x = a.d, x$1 = a.nd - 1 >> 0, ((x$1 < 0 || x$1 >= x.length) ? $throwRuntimeError("index out of range") : x[x$1])) === 48))) { break; }
			a.nd = a.nd - (1) >> 0;
		}
		if (a.nd === 0) {
			a.dp = 0;
		}
	};
	decimal.ptr.prototype.Assign = function(v) {
		var a, buf, n, v, v1, x, x$1, x$2;
		a = this;
		buf = $clone(arrayType.zero(), arrayType);
		n = 0;
		while (true) {
			if (!((v.$high > 0 || (v.$high === 0 && v.$low > 0)))) { break; }
			v1 = $div64(v, new $Uint64(0, 10), false);
			v = (x = $mul64(new $Uint64(0, 10), v1), new $Uint64(v.$high - x.$high, v.$low - x.$low));
			(n < 0 || n >= buf.length) ? $throwRuntimeError("index out of range") : buf[n] = (new $Uint64(v.$high + 0, v.$low + 48).$low << 24 >>> 24);
			n = n + (1) >> 0;
			v = v1;
		}
		a.nd = 0;
		n = n - (1) >> 0;
		while (true) {
			if (!(n >= 0)) { break; }
			(x$1 = a.d, x$2 = a.nd, (x$2 < 0 || x$2 >= x$1.length) ? $throwRuntimeError("index out of range") : x$1[x$2] = ((n < 0 || n >= buf.length) ? $throwRuntimeError("index out of range") : buf[n]));
			a.nd = a.nd + (1) >> 0;
			n = n - (1) >> 0;
		}
		a.dp = a.nd;
		trim(a);
	};
	decimal.prototype.Assign = function(v) { return this.$val.Assign(v); };
	rightShift = function(a, k) {
		var a, c, c$1, dig, dig$1, k, n, r, w, x, x$1, x$2, x$3, y, y$1;
		r = 0;
		w = 0;
		n = 0;
		while (true) {
			if (!(((n >> $min(k, 31)) >> 0) === 0)) { break; }
			if (r >= a.nd) {
				if (n === 0) {
					a.nd = 0;
					return;
				}
				while (true) {
					if (!(((n >> $min(k, 31)) >> 0) === 0)) { break; }
					n = n * 10 >> 0;
					r = r + (1) >> 0;
				}
				break;
			}
			c = ((x = a.d, ((r < 0 || r >= x.length) ? $throwRuntimeError("index out of range") : x[r])) >> 0);
			n = ((n * 10 >> 0) + c >> 0) - 48 >> 0;
			r = r + (1) >> 0;
		}
		a.dp = a.dp - ((r - 1 >> 0)) >> 0;
		while (true) {
			if (!(r < a.nd)) { break; }
			c$1 = ((x$1 = a.d, ((r < 0 || r >= x$1.length) ? $throwRuntimeError("index out of range") : x$1[r])) >> 0);
			dig = (n >> $min(k, 31)) >> 0;
			n = n - (((y = k, y < 32 ? (dig << y) : 0) >> 0)) >> 0;
			(x$2 = a.d, (w < 0 || w >= x$2.length) ? $throwRuntimeError("index out of range") : x$2[w] = ((dig + 48 >> 0) << 24 >>> 24));
			w = w + (1) >> 0;
			n = ((n * 10 >> 0) + c$1 >> 0) - 48 >> 0;
			r = r + (1) >> 0;
		}
		while (true) {
			if (!(n > 0)) { break; }
			dig$1 = (n >> $min(k, 31)) >> 0;
			n = n - (((y$1 = k, y$1 < 32 ? (dig$1 << y$1) : 0) >> 0)) >> 0;
			if (w < 800) {
				(x$3 = a.d, (w < 0 || w >= x$3.length) ? $throwRuntimeError("index out of range") : x$3[w] = ((dig$1 + 48 >> 0) << 24 >>> 24));
				w = w + (1) >> 0;
			} else if (dig$1 > 0) {
				a.trunc = true;
			}
			n = n * 10 >> 0;
		}
		a.nd = w;
		trim(a);
	};
	prefixIsLessThan = function(b, s) {
		var b, i, s;
		i = 0;
		while (true) {
			if (!(i < s.length)) { break; }
			if (i >= b.$length) {
				return true;
			}
			if (!((((i < 0 || i >= b.$length) ? $throwRuntimeError("index out of range") : b.$array[b.$offset + i]) === s.charCodeAt(i)))) {
				return ((i < 0 || i >= b.$length) ? $throwRuntimeError("index out of range") : b.$array[b.$offset + i]) < s.charCodeAt(i);
			}
			i = i + (1) >> 0;
		}
		return false;
	};
	leftShift = function(a, k) {
		var _q, _q$1, a, delta, k, n, quo, quo$1, r, rem, rem$1, w, x, x$1, x$2, y;
		delta = ((k < 0 || k >= leftcheats.$length) ? $throwRuntimeError("index out of range") : leftcheats.$array[leftcheats.$offset + k]).delta;
		if (prefixIsLessThan($subslice(new sliceType$6(a.d), 0, a.nd), ((k < 0 || k >= leftcheats.$length) ? $throwRuntimeError("index out of range") : leftcheats.$array[leftcheats.$offset + k]).cutoff)) {
			delta = delta - (1) >> 0;
		}
		r = a.nd;
		w = a.nd + delta >> 0;
		n = 0;
		r = r - (1) >> 0;
		while (true) {
			if (!(r >= 0)) { break; }
			n = n + (((y = k, y < 32 ? (((((x = a.d, ((r < 0 || r >= x.length) ? $throwRuntimeError("index out of range") : x[r])) >> 0) - 48 >> 0)) << y) : 0) >> 0)) >> 0;
			quo = (_q = n / 10, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero"));
			rem = n - (10 * quo >> 0) >> 0;
			w = w - (1) >> 0;
			if (w < 800) {
				(x$1 = a.d, (w < 0 || w >= x$1.length) ? $throwRuntimeError("index out of range") : x$1[w] = ((rem + 48 >> 0) << 24 >>> 24));
			} else if (!((rem === 0))) {
				a.trunc = true;
			}
			n = quo;
			r = r - (1) >> 0;
		}
		while (true) {
			if (!(n > 0)) { break; }
			quo$1 = (_q$1 = n / 10, (_q$1 === _q$1 && _q$1 !== 1/0 && _q$1 !== -1/0) ? _q$1 >> 0 : $throwRuntimeError("integer divide by zero"));
			rem$1 = n - (10 * quo$1 >> 0) >> 0;
			w = w - (1) >> 0;
			if (w < 800) {
				(x$2 = a.d, (w < 0 || w >= x$2.length) ? $throwRuntimeError("index out of range") : x$2[w] = ((rem$1 + 48 >> 0) << 24 >>> 24));
			} else if (!((rem$1 === 0))) {
				a.trunc = true;
			}
			n = quo$1;
		}
		a.nd = a.nd + (delta) >> 0;
		if (a.nd >= 800) {
			a.nd = 800;
		}
		a.dp = a.dp + (delta) >> 0;
		trim(a);
	};
	decimal.ptr.prototype.Shift = function(k) {
		var a, k;
		a = this;
		if (a.nd === 0) {
		} else if (k > 0) {
			while (true) {
				if (!(k > 27)) { break; }
				leftShift(a, 27);
				k = k - (27) >> 0;
			}
			leftShift(a, (k >>> 0));
		} else if (k < 0) {
			while (true) {
				if (!(k < -27)) { break; }
				rightShift(a, 27);
				k = k + (27) >> 0;
			}
			rightShift(a, (-k >>> 0));
		}
	};
	decimal.prototype.Shift = function(k) { return this.$val.Shift(k); };
	shouldRoundUp = function(a, nd) {
		var _r, a, nd, x, x$1, x$2, x$3;
		if (nd < 0 || nd >= a.nd) {
			return false;
		}
		if (((x = a.d, ((nd < 0 || nd >= x.length) ? $throwRuntimeError("index out of range") : x[nd])) === 53) && ((nd + 1 >> 0) === a.nd)) {
			if (a.trunc) {
				return true;
			}
			return nd > 0 && !(((_r = (((x$1 = a.d, x$2 = nd - 1 >> 0, ((x$2 < 0 || x$2 >= x$1.length) ? $throwRuntimeError("index out of range") : x$1[x$2])) - 48 << 24 >>> 24)) % 2, _r === _r ? _r : $throwRuntimeError("integer divide by zero")) === 0));
		}
		return (x$3 = a.d, ((nd < 0 || nd >= x$3.length) ? $throwRuntimeError("index out of range") : x$3[nd])) >= 53;
	};
	decimal.ptr.prototype.Round = function(nd) {
		var a, nd;
		a = this;
		if (nd < 0 || nd >= a.nd) {
			return;
		}
		if (shouldRoundUp(a, nd)) {
			a.RoundUp(nd);
		} else {
			a.RoundDown(nd);
		}
	};
	decimal.prototype.Round = function(nd) { return this.$val.Round(nd); };
	decimal.ptr.prototype.RoundDown = function(nd) {
		var a, nd;
		a = this;
		if (nd < 0 || nd >= a.nd) {
			return;
		}
		a.nd = nd;
		trim(a);
	};
	decimal.prototype.RoundDown = function(nd) { return this.$val.RoundDown(nd); };
	decimal.ptr.prototype.RoundUp = function(nd) {
		var a, c, i, nd, x, x$1, x$2;
		a = this;
		if (nd < 0 || nd >= a.nd) {
			return;
		}
		i = nd - 1 >> 0;
		while (true) {
			if (!(i >= 0)) { break; }
			c = (x = a.d, ((i < 0 || i >= x.length) ? $throwRuntimeError("index out of range") : x[i]));
			if (c < 57) {
				(x$2 = a.d, (i < 0 || i >= x$2.length) ? $throwRuntimeError("index out of range") : x$2[i] = (x$1 = a.d, ((i < 0 || i >= x$1.length) ? $throwRuntimeError("index out of range") : x$1[i])) + (1) << 24 >>> 24);
				a.nd = i + 1 >> 0;
				return;
			}
			i = i - (1) >> 0;
		}
		a.d[0] = 49;
		a.nd = 1;
		a.dp = a.dp + (1) >> 0;
	};
	decimal.prototype.RoundUp = function(nd) { return this.$val.RoundUp(nd); };
	decimal.ptr.prototype.RoundedInteger = function() {
		var a, i, n, x, x$1, x$2, x$3;
		a = this;
		if (a.dp > 20) {
			return new $Uint64(4294967295, 4294967295);
		}
		i = 0;
		n = new $Uint64(0, 0);
		i = 0;
		while (true) {
			if (!(i < a.dp && i < a.nd)) { break; }
			n = (x = $mul64(n, new $Uint64(0, 10)), x$1 = new $Uint64(0, ((x$2 = a.d, ((i < 0 || i >= x$2.length) ? $throwRuntimeError("index out of range") : x$2[i])) - 48 << 24 >>> 24)), new $Uint64(x.$high + x$1.$high, x.$low + x$1.$low));
			i = i + (1) >> 0;
		}
		while (true) {
			if (!(i < a.dp)) { break; }
			n = $mul64(n, (new $Uint64(0, 10)));
			i = i + (1) >> 0;
		}
		if (shouldRoundUp(a, a.dp)) {
			n = (x$3 = new $Uint64(0, 1), new $Uint64(n.$high + x$3.$high, n.$low + x$3.$low));
		}
		return n;
	};
	decimal.prototype.RoundedInteger = function() { return this.$val.RoundedInteger(); };
	extFloat.ptr.prototype.AssignComputeBounds = function(mant, exp, neg, flt) {
		var _tmp, _tmp$1, exp, expBiased, f, flt, lower = new extFloat.ptr(), mant, neg, upper = new extFloat.ptr(), x, x$1, x$2, x$3, x$4;
		f = this;
		f.mant = mant;
		f.exp = exp - (flt.mantbits >> 0) >> 0;
		f.neg = neg;
		if (f.exp <= 0 && (x = $shiftLeft64(($shiftRightUint64(mant, (-f.exp >>> 0))), (-f.exp >>> 0)), (mant.$high === x.$high && mant.$low === x.$low))) {
			f.mant = $shiftRightUint64(f.mant, ((-f.exp >>> 0)));
			f.exp = 0;
			_tmp = $clone(f, extFloat); _tmp$1 = $clone(f, extFloat); $copy(lower, _tmp, extFloat); $copy(upper, _tmp$1, extFloat);
			return [lower, upper];
		}
		expBiased = exp - flt.bias >> 0;
		$copy(upper, new extFloat.ptr((x$1 = $mul64(new $Uint64(0, 2), f.mant), new $Uint64(x$1.$high + 0, x$1.$low + 1)), f.exp - 1 >> 0, f.neg), extFloat);
		if (!((x$2 = $shiftLeft64(new $Uint64(0, 1), flt.mantbits), (mant.$high === x$2.$high && mant.$low === x$2.$low))) || (expBiased === 1)) {
			$copy(lower, new extFloat.ptr((x$3 = $mul64(new $Uint64(0, 2), f.mant), new $Uint64(x$3.$high - 0, x$3.$low - 1)), f.exp - 1 >> 0, f.neg), extFloat);
		} else {
			$copy(lower, new extFloat.ptr((x$4 = $mul64(new $Uint64(0, 4), f.mant), new $Uint64(x$4.$high - 0, x$4.$low - 1)), f.exp - 2 >> 0, f.neg), extFloat);
		}
		return [lower, upper];
	};
	extFloat.prototype.AssignComputeBounds = function(mant, exp, neg, flt) { return this.$val.AssignComputeBounds(mant, exp, neg, flt); };
	extFloat.ptr.prototype.Normalize = function() {
		var _tmp, _tmp$1, _tmp$2, _tmp$3, exp, f, mant, shift = 0, x, x$1, x$2, x$3, x$4, x$5;
		f = this;
		_tmp = f.mant; _tmp$1 = f.exp; mant = _tmp; exp = _tmp$1;
		if ((mant.$high === 0 && mant.$low === 0)) {
			shift = 0;
			return shift;
		}
		if ((x = $shiftRightUint64(mant, 32), (x.$high === 0 && x.$low === 0))) {
			mant = $shiftLeft64(mant, (32));
			exp = exp - (32) >> 0;
		}
		if ((x$1 = $shiftRightUint64(mant, 48), (x$1.$high === 0 && x$1.$low === 0))) {
			mant = $shiftLeft64(mant, (16));
			exp = exp - (16) >> 0;
		}
		if ((x$2 = $shiftRightUint64(mant, 56), (x$2.$high === 0 && x$2.$low === 0))) {
			mant = $shiftLeft64(mant, (8));
			exp = exp - (8) >> 0;
		}
		if ((x$3 = $shiftRightUint64(mant, 60), (x$3.$high === 0 && x$3.$low === 0))) {
			mant = $shiftLeft64(mant, (4));
			exp = exp - (4) >> 0;
		}
		if ((x$4 = $shiftRightUint64(mant, 62), (x$4.$high === 0 && x$4.$low === 0))) {
			mant = $shiftLeft64(mant, (2));
			exp = exp - (2) >> 0;
		}
		if ((x$5 = $shiftRightUint64(mant, 63), (x$5.$high === 0 && x$5.$low === 0))) {
			mant = $shiftLeft64(mant, (1));
			exp = exp - (1) >> 0;
		}
		shift = ((f.exp - exp >> 0) >>> 0);
		_tmp$2 = mant; _tmp$3 = exp; f.mant = _tmp$2; f.exp = _tmp$3;
		return shift;
	};
	extFloat.prototype.Normalize = function() { return this.$val.Normalize(); };
	extFloat.ptr.prototype.Multiply = function(g) {
		var _tmp, _tmp$1, _tmp$2, _tmp$3, cross1, cross2, f, fhi, flo, g, ghi, glo, rem, x, x$1, x$10, x$2, x$3, x$4, x$5, x$6, x$7, x$8, x$9;
		f = this;
		g = $clone(g, extFloat);
		_tmp = $shiftRightUint64(f.mant, 32); _tmp$1 = new $Uint64(0, (f.mant.$low >>> 0)); fhi = _tmp; flo = _tmp$1;
		_tmp$2 = $shiftRightUint64(g.mant, 32); _tmp$3 = new $Uint64(0, (g.mant.$low >>> 0)); ghi = _tmp$2; glo = _tmp$3;
		cross1 = $mul64(fhi, glo);
		cross2 = $mul64(flo, ghi);
		f.mant = (x = (x$1 = $mul64(fhi, ghi), x$2 = $shiftRightUint64(cross1, 32), new $Uint64(x$1.$high + x$2.$high, x$1.$low + x$2.$low)), x$3 = $shiftRightUint64(cross2, 32), new $Uint64(x.$high + x$3.$high, x.$low + x$3.$low));
		rem = (x$4 = (x$5 = new $Uint64(0, (cross1.$low >>> 0)), x$6 = new $Uint64(0, (cross2.$low >>> 0)), new $Uint64(x$5.$high + x$6.$high, x$5.$low + x$6.$low)), x$7 = $shiftRightUint64(($mul64(flo, glo)), 32), new $Uint64(x$4.$high + x$7.$high, x$4.$low + x$7.$low));
		rem = (x$8 = new $Uint64(0, 2147483648), new $Uint64(rem.$high + x$8.$high, rem.$low + x$8.$low));
		f.mant = (x$9 = f.mant, x$10 = ($shiftRightUint64(rem, 32)), new $Uint64(x$9.$high + x$10.$high, x$9.$low + x$10.$low));
		f.exp = (f.exp + g.exp >> 0) + 64 >> 0;
	};
	extFloat.prototype.Multiply = function(g) { return this.$val.Multiply(g); };
	extFloat.ptr.prototype.AssignDecimal = function(mantissa, exp10, neg, trunc, flt) {
		var _q, _r, adjExp, denormalExp, errors$1, exp10, extrabits, f, flt, halfway, i, mant_extra, mantissa, neg, ok = false, shift, trunc, x, x$1, x$10, x$11, x$12, x$2, x$3, x$4, x$5, x$6, x$7, x$8, x$9, y;
		f = this;
		errors$1 = 0;
		if (trunc) {
			errors$1 = errors$1 + (4) >> 0;
		}
		f.mant = mantissa;
		f.exp = 0;
		f.neg = neg;
		i = (_q = ((exp10 - -348 >> 0)) / 8, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero"));
		if (exp10 < -348 || i >= 87) {
			ok = false;
			return ok;
		}
		adjExp = (_r = ((exp10 - -348 >> 0)) % 8, _r === _r ? _r : $throwRuntimeError("integer divide by zero"));
		if (adjExp < 19 && (x = (x$1 = 19 - adjExp >> 0, ((x$1 < 0 || x$1 >= uint64pow10.length) ? $throwRuntimeError("index out of range") : uint64pow10[x$1])), (mantissa.$high < x.$high || (mantissa.$high === x.$high && mantissa.$low < x.$low)))) {
			f.mant = $mul64(f.mant, (((adjExp < 0 || adjExp >= uint64pow10.length) ? $throwRuntimeError("index out of range") : uint64pow10[adjExp])));
			f.Normalize();
		} else {
			f.Normalize();
			f.Multiply(((adjExp < 0 || adjExp >= smallPowersOfTen.length) ? $throwRuntimeError("index out of range") : smallPowersOfTen[adjExp]));
			errors$1 = errors$1 + (4) >> 0;
		}
		f.Multiply(((i < 0 || i >= powersOfTen.length) ? $throwRuntimeError("index out of range") : powersOfTen[i]));
		if (errors$1 > 0) {
			errors$1 = errors$1 + (1) >> 0;
		}
		errors$1 = errors$1 + (4) >> 0;
		shift = f.Normalize();
		errors$1 = (y = (shift), y < 32 ? (errors$1 << y) : 0) >> 0;
		denormalExp = flt.bias - 63 >> 0;
		extrabits = 0;
		if (f.exp <= denormalExp) {
			extrabits = (((63 - flt.mantbits >>> 0) + 1 >>> 0) + ((denormalExp - f.exp >> 0) >>> 0) >>> 0);
		} else {
			extrabits = (63 - flt.mantbits >>> 0);
		}
		halfway = $shiftLeft64(new $Uint64(0, 1), ((extrabits - 1 >>> 0)));
		mant_extra = (x$2 = f.mant, x$3 = (x$4 = $shiftLeft64(new $Uint64(0, 1), extrabits), new $Uint64(x$4.$high - 0, x$4.$low - 1)), new $Uint64(x$2.$high & x$3.$high, (x$2.$low & x$3.$low) >>> 0));
		if ((x$5 = (x$6 = new $Int64(halfway.$high, halfway.$low), x$7 = new $Int64(0, errors$1), new $Int64(x$6.$high - x$7.$high, x$6.$low - x$7.$low)), x$8 = new $Int64(mant_extra.$high, mant_extra.$low), (x$5.$high < x$8.$high || (x$5.$high === x$8.$high && x$5.$low < x$8.$low))) && (x$9 = new $Int64(mant_extra.$high, mant_extra.$low), x$10 = (x$11 = new $Int64(halfway.$high, halfway.$low), x$12 = new $Int64(0, errors$1), new $Int64(x$11.$high + x$12.$high, x$11.$low + x$12.$low)), (x$9.$high < x$10.$high || (x$9.$high === x$10.$high && x$9.$low < x$10.$low)))) {
			ok = false;
			return ok;
		}
		ok = true;
		return ok;
	};
	extFloat.prototype.AssignDecimal = function(mantissa, exp10, neg, trunc, flt) { return this.$val.AssignDecimal(mantissa, exp10, neg, trunc, flt); };
	extFloat.ptr.prototype.frexp10 = function() {
		var _q, _q$1, _tmp, _tmp$1, approxExp10, exp, exp10 = 0, f, i, index = 0;
		f = this;
		approxExp10 = (_q = (((-46 - f.exp >> 0)) * 28 >> 0) / 93, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero"));
		i = (_q$1 = ((approxExp10 - -348 >> 0)) / 8, (_q$1 === _q$1 && _q$1 !== 1/0 && _q$1 !== -1/0) ? _q$1 >> 0 : $throwRuntimeError("integer divide by zero"));
		Loop:
		while (true) {
			if (!(true)) { break; }
			exp = (f.exp + ((i < 0 || i >= powersOfTen.length) ? $throwRuntimeError("index out of range") : powersOfTen[i]).exp >> 0) + 64 >> 0;
			if (exp < -60) {
				i = i + (1) >> 0;
			} else if (exp > -32) {
				i = i - (1) >> 0;
			} else {
				break Loop;
			}
		}
		f.Multiply(((i < 0 || i >= powersOfTen.length) ? $throwRuntimeError("index out of range") : powersOfTen[i]));
		_tmp = -((-348 + (i * 8 >> 0) >> 0)); _tmp$1 = i; exp10 = _tmp; index = _tmp$1;
		return [exp10, index];
	};
	extFloat.prototype.frexp10 = function() { return this.$val.frexp10(); };
	frexp10Many = function(a, b, c) {
		var _tuple, a, b, c, exp10 = 0, i;
		_tuple = c.frexp10(); exp10 = _tuple[0]; i = _tuple[1];
		a.Multiply(((i < 0 || i >= powersOfTen.length) ? $throwRuntimeError("index out of range") : powersOfTen[i]));
		b.Multiply(((i < 0 || i >= powersOfTen.length) ? $throwRuntimeError("index out of range") : powersOfTen[i]));
		return exp10;
	};
	extFloat.ptr.prototype.FixedDecimal = function(d, n) {
		var _q, _q$1, _tmp, _tmp$1, _tuple, buf, d, digit, exp10, f, fraction, i, i$1, i$2, integer, integerDigits, n, nd, needed, nonAsciiName, ok, pos, pow, pow10, rest, shift, v, v1, x, x$1, x$10, x$11, x$12, x$13, x$2, x$3, x$4, x$5, x$6, x$7, x$8, x$9;
		f = this;
		if ((x = f.mant, (x.$high === 0 && x.$low === 0))) {
			d.nd = 0;
			d.dp = 0;
			d.neg = f.neg;
			return true;
		}
		if (n === 0) {
			$panic(new $String("strconv: internal error: extFloat.FixedDecimal called with n == 0"));
		}
		f.Normalize();
		_tuple = f.frexp10(); exp10 = _tuple[0];
		shift = (-f.exp >>> 0);
		integer = ($shiftRightUint64(f.mant, shift).$low >>> 0);
		fraction = (x$1 = f.mant, x$2 = $shiftLeft64(new $Uint64(0, integer), shift), new $Uint64(x$1.$high - x$2.$high, x$1.$low - x$2.$low));
		nonAsciiName = new $Uint64(0, 1);
		needed = n;
		integerDigits = 0;
		pow10 = new $Uint64(0, 1);
		_tmp = 0; _tmp$1 = new $Uint64(0, 1); i = _tmp; pow = _tmp$1;
		while (true) {
			if (!(i < 20)) { break; }
			if ((x$3 = new $Uint64(0, integer), (pow.$high > x$3.$high || (pow.$high === x$3.$high && pow.$low > x$3.$low)))) {
				integerDigits = i;
				break;
			}
			pow = $mul64(pow, (new $Uint64(0, 10)));
			i = i + (1) >> 0;
		}
		rest = integer;
		if (integerDigits > needed) {
			pow10 = (x$4 = integerDigits - needed >> 0, ((x$4 < 0 || x$4 >= uint64pow10.length) ? $throwRuntimeError("index out of range") : uint64pow10[x$4]));
			integer = (_q = integer / ((pow10.$low >>> 0)), (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >>> 0 : $throwRuntimeError("integer divide by zero"));
			rest = rest - ((x$5 = (pow10.$low >>> 0), (((integer >>> 16 << 16) * x$5 >>> 0) + (integer << 16 >>> 16) * x$5) >>> 0)) >>> 0;
		} else {
			rest = 0;
		}
		buf = $clone(arrayType$1.zero(), arrayType$1);
		pos = 32;
		v = integer;
		while (true) {
			if (!(v > 0)) { break; }
			v1 = (_q$1 = v / 10, (_q$1 === _q$1 && _q$1 !== 1/0 && _q$1 !== -1/0) ? _q$1 >>> 0 : $throwRuntimeError("integer divide by zero"));
			v = v - (((((10 >>> 16 << 16) * v1 >>> 0) + (10 << 16 >>> 16) * v1) >>> 0)) >>> 0;
			pos = pos - (1) >> 0;
			(pos < 0 || pos >= buf.length) ? $throwRuntimeError("index out of range") : buf[pos] = ((v + 48 >>> 0) << 24 >>> 24);
			v = v1;
		}
		i$1 = pos;
		while (true) {
			if (!(i$1 < 32)) { break; }
			(x$6 = d.d, x$7 = i$1 - pos >> 0, (x$7 < 0 || x$7 >= x$6.$length) ? $throwRuntimeError("index out of range") : x$6.$array[x$6.$offset + x$7] = ((i$1 < 0 || i$1 >= buf.length) ? $throwRuntimeError("index out of range") : buf[i$1]));
			i$1 = i$1 + (1) >> 0;
		}
		nd = 32 - pos >> 0;
		d.nd = nd;
		d.dp = integerDigits + exp10 >> 0;
		needed = needed - (nd) >> 0;
		if (needed > 0) {
			if (!((rest === 0)) || !((pow10.$high === 0 && pow10.$low === 1))) {
				$panic(new $String("strconv: internal error, rest != 0 but needed > 0"));
			}
			while (true) {
				if (!(needed > 0)) { break; }
				fraction = $mul64(fraction, (new $Uint64(0, 10)));
				nonAsciiName = $mul64(nonAsciiName, (new $Uint64(0, 10)));
				if ((x$8 = $mul64(new $Uint64(0, 2), nonAsciiName), x$9 = $shiftLeft64(new $Uint64(0, 1), shift), (x$8.$high > x$9.$high || (x$8.$high === x$9.$high && x$8.$low > x$9.$low)))) {
					return false;
				}
				digit = $shiftRightUint64(fraction, shift);
				(x$10 = d.d, (nd < 0 || nd >= x$10.$length) ? $throwRuntimeError("index out of range") : x$10.$array[x$10.$offset + nd] = (new $Uint64(digit.$high + 0, digit.$low + 48).$low << 24 >>> 24));
				fraction = (x$11 = $shiftLeft64(digit, shift), new $Uint64(fraction.$high - x$11.$high, fraction.$low - x$11.$low));
				nd = nd + (1) >> 0;
				needed = needed - (1) >> 0;
			}
			d.nd = nd;
		}
		ok = adjustLastDigitFixed(d, (x$12 = $shiftLeft64(new $Uint64(0, rest), shift), new $Uint64(x$12.$high | fraction.$high, (x$12.$low | fraction.$low) >>> 0)), pow10, shift, nonAsciiName);
		if (!ok) {
			return false;
		}
		i$2 = d.nd - 1 >> 0;
		while (true) {
			if (!(i$2 >= 0)) { break; }
			if (!(((x$13 = d.d, ((i$2 < 0 || i$2 >= x$13.$length) ? $throwRuntimeError("index out of range") : x$13.$array[x$13.$offset + i$2])) === 48))) {
				d.nd = i$2 + 1 >> 0;
				break;
			}
			i$2 = i$2 - (1) >> 0;
		}
		return true;
	};
	extFloat.prototype.FixedDecimal = function(d, n) { return this.$val.FixedDecimal(d, n); };
	adjustLastDigitFixed = function(d, num, den, shift, nonAsciiName) {
		var d, den, i, nonAsciiName, num, shift, x, x$1, x$10, x$2, x$3, x$4, x$5, x$6, x$7, x$8, x$9;
		if ((x = $shiftLeft64(den, shift), (num.$high > x.$high || (num.$high === x.$high && num.$low > x.$low)))) {
			$panic(new $String("strconv: num > den<<shift in adjustLastDigitFixed"));
		}
		if ((x$1 = $mul64(new $Uint64(0, 2), nonAsciiName), x$2 = $shiftLeft64(den, shift), (x$1.$high > x$2.$high || (x$1.$high === x$2.$high && x$1.$low > x$2.$low)))) {
			$panic(new $String("strconv: \xCE\xB5 > (den<<shift)/2"));
		}
		if ((x$3 = $mul64(new $Uint64(0, 2), (new $Uint64(num.$high + nonAsciiName.$high, num.$low + nonAsciiName.$low))), x$4 = $shiftLeft64(den, shift), (x$3.$high < x$4.$high || (x$3.$high === x$4.$high && x$3.$low < x$4.$low)))) {
			return true;
		}
		if ((x$5 = $mul64(new $Uint64(0, 2), (new $Uint64(num.$high - nonAsciiName.$high, num.$low - nonAsciiName.$low))), x$6 = $shiftLeft64(den, shift), (x$5.$high > x$6.$high || (x$5.$high === x$6.$high && x$5.$low > x$6.$low)))) {
			i = d.nd - 1 >> 0;
			while (true) {
				if (!(i >= 0)) { break; }
				if ((x$7 = d.d, ((i < 0 || i >= x$7.$length) ? $throwRuntimeError("index out of range") : x$7.$array[x$7.$offset + i])) === 57) {
					d.nd = d.nd - (1) >> 0;
				} else {
					break;
				}
				i = i - (1) >> 0;
			}
			if (i < 0) {
				(x$8 = d.d, (0 < 0 || 0 >= x$8.$length) ? $throwRuntimeError("index out of range") : x$8.$array[x$8.$offset + 0] = 49);
				d.nd = 1;
				d.dp = d.dp + (1) >> 0;
			} else {
				(x$10 = d.d, (i < 0 || i >= x$10.$length) ? $throwRuntimeError("index out of range") : x$10.$array[x$10.$offset + i] = (x$9 = d.d, ((i < 0 || i >= x$9.$length) ? $throwRuntimeError("index out of range") : x$9.$array[x$9.$offset + i])) + (1) << 24 >>> 24);
			}
			return true;
		}
		return false;
	};
	extFloat.ptr.prototype.ShortestDecimal = function(d, lower, upper) {
		var _q, _tmp, _tmp$1, _tmp$2, _tmp$3, allowance, buf, currentDiff, d, digit, digit$1, exp10, f, fraction, i, i$1, i$2, integer, integerDigits, lower, multiplier, n, nd, pow, pow$1, shift, targetDiff, upper, v, v1, x, x$1, x$10, x$11, x$12, x$13, x$14, x$15, x$16, x$17, x$18, x$19, x$2, x$20, x$21, x$22, x$23, x$24, x$3, x$4, x$5, x$6, x$7, x$8, x$9;
		f = this;
		if ((x = f.mant, (x.$high === 0 && x.$low === 0))) {
			d.nd = 0;
			d.dp = 0;
			d.neg = f.neg;
			return true;
		}
		if ((f.exp === 0) && $equal(lower, f, extFloat) && $equal(lower, upper, extFloat)) {
			buf = $clone(arrayType.zero(), arrayType);
			n = 23;
			v = f.mant;
			while (true) {
				if (!((v.$high > 0 || (v.$high === 0 && v.$low > 0)))) { break; }
				v1 = $div64(v, new $Uint64(0, 10), false);
				v = (x$1 = $mul64(new $Uint64(0, 10), v1), new $Uint64(v.$high - x$1.$high, v.$low - x$1.$low));
				(n < 0 || n >= buf.length) ? $throwRuntimeError("index out of range") : buf[n] = (new $Uint64(v.$high + 0, v.$low + 48).$low << 24 >>> 24);
				n = n - (1) >> 0;
				v = v1;
			}
			nd = (24 - n >> 0) - 1 >> 0;
			i = 0;
			while (true) {
				if (!(i < nd)) { break; }
				(x$3 = d.d, (i < 0 || i >= x$3.$length) ? $throwRuntimeError("index out of range") : x$3.$array[x$3.$offset + i] = (x$2 = (n + 1 >> 0) + i >> 0, ((x$2 < 0 || x$2 >= buf.length) ? $throwRuntimeError("index out of range") : buf[x$2])));
				i = i + (1) >> 0;
			}
			_tmp = nd; _tmp$1 = nd; d.nd = _tmp; d.dp = _tmp$1;
			while (true) {
				if (!(d.nd > 0 && ((x$4 = d.d, x$5 = d.nd - 1 >> 0, ((x$5 < 0 || x$5 >= x$4.$length) ? $throwRuntimeError("index out of range") : x$4.$array[x$4.$offset + x$5])) === 48))) { break; }
				d.nd = d.nd - (1) >> 0;
			}
			if (d.nd === 0) {
				d.dp = 0;
			}
			d.neg = f.neg;
			return true;
		}
		upper.Normalize();
		if (f.exp > upper.exp) {
			f.mant = $shiftLeft64(f.mant, (((f.exp - upper.exp >> 0) >>> 0)));
			f.exp = upper.exp;
		}
		if (lower.exp > upper.exp) {
			lower.mant = $shiftLeft64(lower.mant, (((lower.exp - upper.exp >> 0) >>> 0)));
			lower.exp = upper.exp;
		}
		exp10 = frexp10Many(lower, f, upper);
		upper.mant = (x$6 = upper.mant, x$7 = new $Uint64(0, 1), new $Uint64(x$6.$high + x$7.$high, x$6.$low + x$7.$low));
		lower.mant = (x$8 = lower.mant, x$9 = new $Uint64(0, 1), new $Uint64(x$8.$high - x$9.$high, x$8.$low - x$9.$low));
		shift = (-upper.exp >>> 0);
		integer = ($shiftRightUint64(upper.mant, shift).$low >>> 0);
		fraction = (x$10 = upper.mant, x$11 = $shiftLeft64(new $Uint64(0, integer), shift), new $Uint64(x$10.$high - x$11.$high, x$10.$low - x$11.$low));
		allowance = (x$12 = upper.mant, x$13 = lower.mant, new $Uint64(x$12.$high - x$13.$high, x$12.$low - x$13.$low));
		targetDiff = (x$14 = upper.mant, x$15 = f.mant, new $Uint64(x$14.$high - x$15.$high, x$14.$low - x$15.$low));
		integerDigits = 0;
		_tmp$2 = 0; _tmp$3 = new $Uint64(0, 1); i$1 = _tmp$2; pow = _tmp$3;
		while (true) {
			if (!(i$1 < 20)) { break; }
			if ((x$16 = new $Uint64(0, integer), (pow.$high > x$16.$high || (pow.$high === x$16.$high && pow.$low > x$16.$low)))) {
				integerDigits = i$1;
				break;
			}
			pow = $mul64(pow, (new $Uint64(0, 10)));
			i$1 = i$1 + (1) >> 0;
		}
		i$2 = 0;
		while (true) {
			if (!(i$2 < integerDigits)) { break; }
			pow$1 = (x$17 = (integerDigits - i$2 >> 0) - 1 >> 0, ((x$17 < 0 || x$17 >= uint64pow10.length) ? $throwRuntimeError("index out of range") : uint64pow10[x$17]));
			digit = (_q = integer / (pow$1.$low >>> 0), (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >>> 0 : $throwRuntimeError("integer divide by zero"));
			(x$18 = d.d, (i$2 < 0 || i$2 >= x$18.$length) ? $throwRuntimeError("index out of range") : x$18.$array[x$18.$offset + i$2] = ((digit + 48 >>> 0) << 24 >>> 24));
			integer = integer - ((x$19 = (pow$1.$low >>> 0), (((digit >>> 16 << 16) * x$19 >>> 0) + (digit << 16 >>> 16) * x$19) >>> 0)) >>> 0;
			currentDiff = (x$20 = $shiftLeft64(new $Uint64(0, integer), shift), new $Uint64(x$20.$high + fraction.$high, x$20.$low + fraction.$low));
			if ((currentDiff.$high < allowance.$high || (currentDiff.$high === allowance.$high && currentDiff.$low < allowance.$low))) {
				d.nd = i$2 + 1 >> 0;
				d.dp = integerDigits + exp10 >> 0;
				d.neg = f.neg;
				return adjustLastDigit(d, currentDiff, targetDiff, allowance, $shiftLeft64(pow$1, shift), new $Uint64(0, 2));
			}
			i$2 = i$2 + (1) >> 0;
		}
		d.nd = integerDigits;
		d.dp = d.nd + exp10 >> 0;
		d.neg = f.neg;
		digit$1 = 0;
		multiplier = new $Uint64(0, 1);
		while (true) {
			if (!(true)) { break; }
			fraction = $mul64(fraction, (new $Uint64(0, 10)));
			multiplier = $mul64(multiplier, (new $Uint64(0, 10)));
			digit$1 = ($shiftRightUint64(fraction, shift).$low >> 0);
			(x$21 = d.d, x$22 = d.nd, (x$22 < 0 || x$22 >= x$21.$length) ? $throwRuntimeError("index out of range") : x$21.$array[x$21.$offset + x$22] = ((digit$1 + 48 >> 0) << 24 >>> 24));
			d.nd = d.nd + (1) >> 0;
			fraction = (x$23 = $shiftLeft64(new $Uint64(0, digit$1), shift), new $Uint64(fraction.$high - x$23.$high, fraction.$low - x$23.$low));
			if ((x$24 = $mul64(allowance, multiplier), (fraction.$high < x$24.$high || (fraction.$high === x$24.$high && fraction.$low < x$24.$low)))) {
				return adjustLastDigit(d, fraction, $mul64(targetDiff, multiplier), $mul64(allowance, multiplier), $shiftLeft64(new $Uint64(0, 1), shift), $mul64(multiplier, new $Uint64(0, 2)));
			}
		}
	};
	extFloat.prototype.ShortestDecimal = function(d, lower, upper) { return this.$val.ShortestDecimal(d, lower, upper); };
	adjustLastDigit = function(d, currentDiff, targetDiff, maxDiff, ulpDecimal, ulpBinary) {
		var _index, currentDiff, d, maxDiff, targetDiff, ulpBinary, ulpDecimal, x, x$1, x$10, x$11, x$12, x$2, x$3, x$4, x$5, x$6, x$7, x$8, x$9;
		if ((x = $mul64(new $Uint64(0, 2), ulpBinary), (ulpDecimal.$high < x.$high || (ulpDecimal.$high === x.$high && ulpDecimal.$low < x.$low)))) {
			return false;
		}
		while (true) {
			if (!((x$1 = (x$2 = (x$3 = $div64(ulpDecimal, new $Uint64(0, 2), false), new $Uint64(currentDiff.$high + x$3.$high, currentDiff.$low + x$3.$low)), new $Uint64(x$2.$high + ulpBinary.$high, x$2.$low + ulpBinary.$low)), (x$1.$high < targetDiff.$high || (x$1.$high === targetDiff.$high && x$1.$low < targetDiff.$low))))) { break; }
			_index = d.nd - 1 >> 0;
			(x$5 = d.d, (_index < 0 || _index >= x$5.$length) ? $throwRuntimeError("index out of range") : x$5.$array[x$5.$offset + _index] = (x$4 = d.d, ((_index < 0 || _index >= x$4.$length) ? $throwRuntimeError("index out of range") : x$4.$array[x$4.$offset + _index])) - (1) << 24 >>> 24);
			currentDiff = (x$6 = ulpDecimal, new $Uint64(currentDiff.$high + x$6.$high, currentDiff.$low + x$6.$low));
		}
		if ((x$7 = new $Uint64(currentDiff.$high + ulpDecimal.$high, currentDiff.$low + ulpDecimal.$low), x$8 = (x$9 = (x$10 = $div64(ulpDecimal, new $Uint64(0, 2), false), new $Uint64(targetDiff.$high + x$10.$high, targetDiff.$low + x$10.$low)), new $Uint64(x$9.$high + ulpBinary.$high, x$9.$low + ulpBinary.$low)), (x$7.$high < x$8.$high || (x$7.$high === x$8.$high && x$7.$low <= x$8.$low)))) {
			return false;
		}
		if ((currentDiff.$high < ulpBinary.$high || (currentDiff.$high === ulpBinary.$high && currentDiff.$low < ulpBinary.$low)) || (x$11 = new $Uint64(maxDiff.$high - ulpBinary.$high, maxDiff.$low - ulpBinary.$low), (currentDiff.$high > x$11.$high || (currentDiff.$high === x$11.$high && currentDiff.$low > x$11.$low)))) {
			return false;
		}
		if ((d.nd === 1) && ((x$12 = d.d, ((0 < 0 || 0 >= x$12.$length) ? $throwRuntimeError("index out of range") : x$12.$array[x$12.$offset + 0])) === 48)) {
			d.nd = 0;
			d.dp = 0;
		}
		return true;
	};
	AppendFloat = $pkg.AppendFloat = function(dst, f, fmt, prec, bitSize) {
		var bitSize, dst, f, fmt, prec;
		return genericFtoa(dst, f, fmt, prec, bitSize);
	};
	genericFtoa = function(dst, val, fmt, prec, bitSize) {
		var _ref, _ref$1, _ref$2, _ref$3, _tuple, bitSize, bits, buf, buf$1, digits, digs, dst, exp, f, f$1, flt, fmt, lower, mant, neg, ok, prec, s, shortest, upper, val, x, x$1, x$2, x$3, y, y$1;
		bits = new $Uint64(0, 0);
		flt = ptrType$1.nil;
		_ref = bitSize;
		if (_ref === 32) {
			bits = new $Uint64(0, math.Float32bits(val));
			flt = float32info;
		} else if (_ref === 64) {
			bits = math.Float64bits(val);
			flt = float64info;
		} else {
			$panic(new $String("strconv: illegal AppendFloat/FormatFloat bitSize"));
		}
		neg = !((x = $shiftRightUint64(bits, ((flt.expbits + flt.mantbits >>> 0))), (x.$high === 0 && x.$low === 0)));
		exp = ($shiftRightUint64(bits, flt.mantbits).$low >> 0) & ((((y = flt.expbits, y < 32 ? (1 << y) : 0) >> 0) - 1 >> 0));
		mant = (x$1 = (x$2 = $shiftLeft64(new $Uint64(0, 1), flt.mantbits), new $Uint64(x$2.$high - 0, x$2.$low - 1)), new $Uint64(bits.$high & x$1.$high, (bits.$low & x$1.$low) >>> 0));
		_ref$1 = exp;
		if (_ref$1 === (((y$1 = flt.expbits, y$1 < 32 ? (1 << y$1) : 0) >> 0) - 1 >> 0)) {
			s = "";
			if (!((mant.$high === 0 && mant.$low === 0))) {
				s = "NaN";
			} else if (neg) {
				s = "-Inf";
			} else {
				s = "+Inf";
			}
			return $appendSlice(dst, new sliceType$6($stringToBytes(s)));
		} else if (_ref$1 === 0) {
			exp = exp + (1) >> 0;
		} else {
			mant = (x$3 = $shiftLeft64(new $Uint64(0, 1), flt.mantbits), new $Uint64(mant.$high | x$3.$high, (mant.$low | x$3.$low) >>> 0));
		}
		exp = exp + (flt.bias) >> 0;
		if (fmt === 98) {
			return fmtB(dst, neg, mant, exp, flt);
		}
		if (!optimize) {
			return bigFtoa(dst, prec, fmt, neg, mant, exp, flt);
		}
		digs = $clone(new decimalSlice.ptr(), decimalSlice);
		ok = false;
		shortest = prec < 0;
		if (shortest) {
			f = new extFloat.ptr();
			_tuple = f.AssignComputeBounds(mant, exp, neg, flt); lower = $clone(_tuple[0], extFloat); upper = $clone(_tuple[1], extFloat);
			buf = $clone(arrayType$1.zero(), arrayType$1);
			digs.d = new sliceType$6(buf);
			ok = f.ShortestDecimal(digs, lower, upper);
			if (!ok) {
				return bigFtoa(dst, prec, fmt, neg, mant, exp, flt);
			}
			_ref$2 = fmt;
			if (_ref$2 === 101 || _ref$2 === 69) {
				prec = digs.nd - 1 >> 0;
			} else if (_ref$2 === 102) {
				prec = max(digs.nd - digs.dp >> 0, 0);
			} else if (_ref$2 === 103 || _ref$2 === 71) {
				prec = digs.nd;
			}
		} else if (!((fmt === 102))) {
			digits = prec;
			_ref$3 = fmt;
			if (_ref$3 === 101 || _ref$3 === 69) {
				digits = digits + (1) >> 0;
			} else if (_ref$3 === 103 || _ref$3 === 71) {
				if (prec === 0) {
					prec = 1;
				}
				digits = prec;
			}
			if (digits <= 15) {
				buf$1 = $clone(arrayType.zero(), arrayType);
				digs.d = new sliceType$6(buf$1);
				f$1 = new extFloat.ptr(mant, exp - (flt.mantbits >> 0) >> 0, neg);
				ok = f$1.FixedDecimal(digs, digits);
			}
		}
		if (!ok) {
			return bigFtoa(dst, prec, fmt, neg, mant, exp, flt);
		}
		return formatDigits(dst, shortest, neg, digs, prec, fmt);
	};
	bigFtoa = function(dst, prec, fmt, neg, mant, exp, flt) {
		var _ref, _ref$1, d, digs, dst, exp, flt, fmt, mant, neg, prec, shortest;
		d = new decimal.ptr();
		d.Assign(mant);
		d.Shift(exp - (flt.mantbits >> 0) >> 0);
		digs = $clone(new decimalSlice.ptr(), decimalSlice);
		shortest = prec < 0;
		if (shortest) {
			roundShortest(d, mant, exp, flt);
			$copy(digs, new decimalSlice.ptr(new sliceType$6(d.d), d.nd, d.dp, false), decimalSlice);
			_ref = fmt;
			if (_ref === 101 || _ref === 69) {
				prec = digs.nd - 1 >> 0;
			} else if (_ref === 102) {
				prec = max(digs.nd - digs.dp >> 0, 0);
			} else if (_ref === 103 || _ref === 71) {
				prec = digs.nd;
			}
		} else {
			_ref$1 = fmt;
			if (_ref$1 === 101 || _ref$1 === 69) {
				d.Round(prec + 1 >> 0);
			} else if (_ref$1 === 102) {
				d.Round(d.dp + prec >> 0);
			} else if (_ref$1 === 103 || _ref$1 === 71) {
				if (prec === 0) {
					prec = 1;
				}
				d.Round(prec);
			}
			$copy(digs, new decimalSlice.ptr(new sliceType$6(d.d), d.nd, d.dp, false), decimalSlice);
		}
		return formatDigits(dst, shortest, neg, digs, prec, fmt);
	};
	formatDigits = function(dst, shortest, neg, digs, prec, fmt) {
		var _ref, digs, dst, eprec, exp, fmt, neg, prec, shortest;
		digs = $clone(digs, decimalSlice);
		_ref = fmt;
		if (_ref === 101 || _ref === 69) {
			return fmtE(dst, neg, digs, prec, fmt);
		} else if (_ref === 102) {
			return fmtF(dst, neg, digs, prec);
		} else if (_ref === 103 || _ref === 71) {
			eprec = prec;
			if (eprec > digs.nd && digs.nd >= digs.dp) {
				eprec = digs.nd;
			}
			if (shortest) {
				eprec = 6;
			}
			exp = digs.dp - 1 >> 0;
			if (exp < -4 || exp >= eprec) {
				if (prec > digs.nd) {
					prec = digs.nd;
				}
				return fmtE(dst, neg, digs, prec - 1 >> 0, (fmt + 101 << 24 >>> 24) - 103 << 24 >>> 24);
			}
			if (prec > digs.dp) {
				prec = digs.nd;
			}
			return fmtF(dst, neg, digs, max(prec - digs.dp >> 0, 0));
		}
		return $append(dst, 37, fmt);
	};
	roundShortest = function(d, mant, exp, flt) {
		var _tmp, _tmp$1, _tmp$2, d, exp, explo, flt, i, inclusive, l, lower, m, mant, mantlo, minexp, okdown, okup, u, upper, x, x$1, x$2, x$3, x$4, x$5, x$6, x$7;
		if ((mant.$high === 0 && mant.$low === 0)) {
			d.nd = 0;
			return;
		}
		minexp = flt.bias + 1 >> 0;
		if (exp > minexp && (332 * ((d.dp - d.nd >> 0)) >> 0) >= (100 * ((exp - (flt.mantbits >> 0) >> 0)) >> 0)) {
			return;
		}
		upper = new decimal.ptr();
		upper.Assign((x = $mul64(mant, new $Uint64(0, 2)), new $Uint64(x.$high + 0, x.$low + 1)));
		upper.Shift((exp - (flt.mantbits >> 0) >> 0) - 1 >> 0);
		mantlo = new $Uint64(0, 0);
		explo = 0;
		if ((x$1 = $shiftLeft64(new $Uint64(0, 1), flt.mantbits), (mant.$high > x$1.$high || (mant.$high === x$1.$high && mant.$low > x$1.$low))) || (exp === minexp)) {
			mantlo = new $Uint64(mant.$high - 0, mant.$low - 1);
			explo = exp;
		} else {
			mantlo = (x$2 = $mul64(mant, new $Uint64(0, 2)), new $Uint64(x$2.$high - 0, x$2.$low - 1));
			explo = exp - 1 >> 0;
		}
		lower = new decimal.ptr();
		lower.Assign((x$3 = $mul64(mantlo, new $Uint64(0, 2)), new $Uint64(x$3.$high + 0, x$3.$low + 1)));
		lower.Shift((explo - (flt.mantbits >> 0) >> 0) - 1 >> 0);
		inclusive = (x$4 = $div64(mant, new $Uint64(0, 2), true), (x$4.$high === 0 && x$4.$low === 0));
		i = 0;
		while (true) {
			if (!(i < d.nd)) { break; }
			_tmp = 0; _tmp$1 = 0; _tmp$2 = 0; l = _tmp; m = _tmp$1; u = _tmp$2;
			if (i < lower.nd) {
				l = (x$5 = lower.d, ((i < 0 || i >= x$5.length) ? $throwRuntimeError("index out of range") : x$5[i]));
			} else {
				l = 48;
			}
			m = (x$6 = d.d, ((i < 0 || i >= x$6.length) ? $throwRuntimeError("index out of range") : x$6[i]));
			if (i < upper.nd) {
				u = (x$7 = upper.d, ((i < 0 || i >= x$7.length) ? $throwRuntimeError("index out of range") : x$7[i]));
			} else {
				u = 48;
			}
			okdown = !((l === m)) || (inclusive && (l === m) && ((i + 1 >> 0) === lower.nd));
			okup = !((m === u)) && (inclusive || (m + 1 << 24 >>> 24) < u || (i + 1 >> 0) < upper.nd);
			if (okdown && okup) {
				d.Round(i + 1 >> 0);
				return;
			} else if (okdown) {
				d.RoundDown(i + 1 >> 0);
				return;
			} else if (okup) {
				d.RoundUp(i + 1 >> 0);
				return;
			}
			i = i + (1) >> 0;
		}
	};
	fmtE = function(dst, neg, d, prec, fmt) {
		var _q, _r, _ref, buf, ch, d, dst, exp, fmt, i, i$1, m, neg, prec, x, x$1;
		d = $clone(d, decimalSlice);
		if (neg) {
			dst = $append(dst, 45);
		}
		ch = 48;
		if (!((d.nd === 0))) {
			ch = (x = d.d, ((0 < 0 || 0 >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + 0]));
		}
		dst = $append(dst, ch);
		if (prec > 0) {
			dst = $append(dst, 46);
			i = 1;
			m = ((d.nd + prec >> 0) + 1 >> 0) - max(d.nd, prec + 1 >> 0) >> 0;
			while (true) {
				if (!(i < m)) { break; }
				dst = $append(dst, (x$1 = d.d, ((i < 0 || i >= x$1.$length) ? $throwRuntimeError("index out of range") : x$1.$array[x$1.$offset + i])));
				i = i + (1) >> 0;
			}
			while (true) {
				if (!(i <= prec)) { break; }
				dst = $append(dst, 48);
				i = i + (1) >> 0;
			}
		}
		dst = $append(dst, fmt);
		exp = d.dp - 1 >> 0;
		if (d.nd === 0) {
			exp = 0;
		}
		if (exp < 0) {
			ch = 45;
			exp = -exp;
		} else {
			ch = 43;
		}
		dst = $append(dst, ch);
		buf = $clone(arrayType$2.zero(), arrayType$2);
		i$1 = 3;
		while (true) {
			if (!(exp >= 10)) { break; }
			i$1 = i$1 - (1) >> 0;
			(i$1 < 0 || i$1 >= buf.length) ? $throwRuntimeError("index out of range") : buf[i$1] = (((_r = exp % 10, _r === _r ? _r : $throwRuntimeError("integer divide by zero")) + 48 >> 0) << 24 >>> 24);
			exp = (_q = exp / (10), (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero"));
		}
		i$1 = i$1 - (1) >> 0;
		(i$1 < 0 || i$1 >= buf.length) ? $throwRuntimeError("index out of range") : buf[i$1] = ((exp + 48 >> 0) << 24 >>> 24);
		_ref = i$1;
		if (_ref === 0) {
			dst = $append(dst, buf[0], buf[1], buf[2]);
		} else if (_ref === 1) {
			dst = $append(dst, buf[1], buf[2]);
		} else if (_ref === 2) {
			dst = $append(dst, 48, buf[2]);
		}
		return dst;
	};
	fmtF = function(dst, neg, d, prec) {
		var ch, d, dst, i, i$1, j, neg, prec, x, x$1;
		d = $clone(d, decimalSlice);
		if (neg) {
			dst = $append(dst, 45);
		}
		if (d.dp > 0) {
			i = 0;
			i = 0;
			while (true) {
				if (!(i < d.dp && i < d.nd)) { break; }
				dst = $append(dst, (x = d.d, ((i < 0 || i >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + i])));
				i = i + (1) >> 0;
			}
			while (true) {
				if (!(i < d.dp)) { break; }
				dst = $append(dst, 48);
				i = i + (1) >> 0;
			}
		} else {
			dst = $append(dst, 48);
		}
		if (prec > 0) {
			dst = $append(dst, 46);
			i$1 = 0;
			while (true) {
				if (!(i$1 < prec)) { break; }
				ch = 48;
				j = d.dp + i$1 >> 0;
				if (0 <= j && j < d.nd) {
					ch = (x$1 = d.d, ((j < 0 || j >= x$1.$length) ? $throwRuntimeError("index out of range") : x$1.$array[x$1.$offset + j]));
				}
				dst = $append(dst, ch);
				i$1 = i$1 + (1) >> 0;
			}
		}
		return dst;
	};
	fmtB = function(dst, neg, mant, exp, flt) {
		var _q, _r, buf, dst, esign, exp, flt, mant, n, neg, w, x;
		buf = $clone(arrayType$3.zero(), arrayType$3);
		w = 50;
		exp = exp - ((flt.mantbits >> 0)) >> 0;
		esign = 43;
		if (exp < 0) {
			esign = 45;
			exp = -exp;
		}
		n = 0;
		while (true) {
			if (!(exp > 0 || n < 1)) { break; }
			n = n + (1) >> 0;
			w = w - (1) >> 0;
			(w < 0 || w >= buf.length) ? $throwRuntimeError("index out of range") : buf[w] = (((_r = exp % 10, _r === _r ? _r : $throwRuntimeError("integer divide by zero")) + 48 >> 0) << 24 >>> 24);
			exp = (_q = exp / (10), (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero"));
		}
		w = w - (1) >> 0;
		(w < 0 || w >= buf.length) ? $throwRuntimeError("index out of range") : buf[w] = esign;
		w = w - (1) >> 0;
		(w < 0 || w >= buf.length) ? $throwRuntimeError("index out of range") : buf[w] = 112;
		n = 0;
		while (true) {
			if (!((mant.$high > 0 || (mant.$high === 0 && mant.$low > 0)) || n < 1)) { break; }
			n = n + (1) >> 0;
			w = w - (1) >> 0;
			(w < 0 || w >= buf.length) ? $throwRuntimeError("index out of range") : buf[w] = ((x = $div64(mant, new $Uint64(0, 10), true), new $Uint64(x.$high + 0, x.$low + 48)).$low << 24 >>> 24);
			mant = $div64(mant, (new $Uint64(0, 10)), false);
		}
		if (neg) {
			w = w - (1) >> 0;
			(w < 0 || w >= buf.length) ? $throwRuntimeError("index out of range") : buf[w] = 45;
		}
		return $appendSlice(dst, $subslice(new sliceType$6(buf), w));
	};
	max = function(a, b) {
		var a, b;
		if (a > b) {
			return a;
		}
		return b;
	};
	FormatInt = $pkg.FormatInt = function(i, base) {
		var _tuple, base, i, s;
		_tuple = formatBits(sliceType$6.nil, new $Uint64(i.$high, i.$low), base, (i.$high < 0 || (i.$high === 0 && i.$low < 0)), false); s = _tuple[1];
		return s;
	};
	Itoa = $pkg.Itoa = function(i) {
		var i;
		return FormatInt(new $Int64(0, i), 10);
	};
	formatBits = function(dst, u, base, neg, append_) {
		var a, append_, b, b$1, base, d = sliceType$6.nil, dst, i, j, m, neg, q, q$1, s = "", s$1, u, x, x$1, x$2, x$3;
		if (base < 2 || base > 36) {
			$panic(new $String("strconv: illegal AppendInt/FormatInt base"));
		}
		a = $clone(arrayType$4.zero(), arrayType$4);
		i = 65;
		if (neg) {
			u = new $Uint64(-u.$high, -u.$low);
		}
		if (base === 10) {
			while (true) {
				if (!((u.$high > 0 || (u.$high === 0 && u.$low >= 100)))) { break; }
				i = i - (2) >> 0;
				q = $div64(u, new $Uint64(0, 100), false);
				j = ((x = $mul64(q, new $Uint64(0, 100)), new $Uint64(u.$high - x.$high, u.$low - x.$low)).$low >>> 0);
				(x$1 = i + 1 >> 0, (x$1 < 0 || x$1 >= a.length) ? $throwRuntimeError("index out of range") : a[x$1] = "0123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789".charCodeAt(j));
				(x$2 = i + 0 >> 0, (x$2 < 0 || x$2 >= a.length) ? $throwRuntimeError("index out of range") : a[x$2] = "0000000000111111111122222222223333333333444444444455555555556666666666777777777788888888889999999999".charCodeAt(j));
				u = q;
			}
			if ((u.$high > 0 || (u.$high === 0 && u.$low >= 10))) {
				i = i - (1) >> 0;
				q$1 = $div64(u, new $Uint64(0, 10), false);
				(i < 0 || i >= a.length) ? $throwRuntimeError("index out of range") : a[i] = "0123456789abcdefghijklmnopqrstuvwxyz".charCodeAt(((x$3 = $mul64(q$1, new $Uint64(0, 10)), new $Uint64(u.$high - x$3.$high, u.$low - x$3.$low)).$low >>> 0));
				u = q$1;
			}
		} else {
			s$1 = ((base < 0 || base >= shifts.length) ? $throwRuntimeError("index out of range") : shifts[base]);
			if (s$1 > 0) {
				b = new $Uint64(0, base);
				m = (b.$low >>> 0) - 1 >>> 0;
				while (true) {
					if (!((u.$high > b.$high || (u.$high === b.$high && u.$low >= b.$low)))) { break; }
					i = i - (1) >> 0;
					(i < 0 || i >= a.length) ? $throwRuntimeError("index out of range") : a[i] = "0123456789abcdefghijklmnopqrstuvwxyz".charCodeAt((((u.$low >>> 0) & m) >>> 0));
					u = $shiftRightUint64(u, (s$1));
				}
			} else {
				b$1 = new $Uint64(0, base);
				while (true) {
					if (!((u.$high > b$1.$high || (u.$high === b$1.$high && u.$low >= b$1.$low)))) { break; }
					i = i - (1) >> 0;
					(i < 0 || i >= a.length) ? $throwRuntimeError("index out of range") : a[i] = "0123456789abcdefghijklmnopqrstuvwxyz".charCodeAt(($div64(u, b$1, true).$low >>> 0));
					u = $div64(u, (b$1), false);
				}
			}
		}
		i = i - (1) >> 0;
		(i < 0 || i >= a.length) ? $throwRuntimeError("index out of range") : a[i] = "0123456789abcdefghijklmnopqrstuvwxyz".charCodeAt((u.$low >>> 0));
		if (neg) {
			i = i - (1) >> 0;
			(i < 0 || i >= a.length) ? $throwRuntimeError("index out of range") : a[i] = 45;
		}
		if (append_) {
			d = $appendSlice(dst, $subslice(new sliceType$6(a), i));
			return [d, s];
		}
		s = $bytesToString($subslice(new sliceType$6(a), i));
		return [d, s];
	};
	quoteWith = function(s, quote, ASCIIonly) {
		var ASCIIonly, _q, _ref, _tuple, buf, n, quote, r, runeTmp, s, s$1, s$2, width;
		runeTmp = $clone(arrayType$5.zero(), arrayType$5);
		buf = $makeSlice(sliceType$6, 0, (_q = (3 * s.length >> 0) / 2, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero")));
		buf = $append(buf, quote);
		width = 0;
		while (true) {
			if (!(s.length > 0)) { break; }
			r = (s.charCodeAt(0) >> 0);
			width = 1;
			if (r >= 128) {
				_tuple = utf8.DecodeRuneInString(s); r = _tuple[0]; width = _tuple[1];
			}
			if ((width === 1) && (r === 65533)) {
				buf = $appendSlice(buf, new sliceType$6($stringToBytes("\\x")));
				buf = $append(buf, "0123456789abcdef".charCodeAt((s.charCodeAt(0) >>> 4 << 24 >>> 24)));
				buf = $append(buf, "0123456789abcdef".charCodeAt(((s.charCodeAt(0) & 15) >>> 0)));
				s = s.substring(width);
				continue;
			}
			if ((r === (quote >> 0)) || (r === 92)) {
				buf = $append(buf, 92);
				buf = $append(buf, (r << 24 >>> 24));
				s = s.substring(width);
				continue;
			}
			if (ASCIIonly) {
				if (r < 128 && IsPrint(r)) {
					buf = $append(buf, (r << 24 >>> 24));
					s = s.substring(width);
					continue;
				}
			} else if (IsPrint(r)) {
				n = utf8.EncodeRune(new sliceType$6(runeTmp), r);
				buf = $appendSlice(buf, $subslice(new sliceType$6(runeTmp), 0, n));
				s = s.substring(width);
				continue;
			}
			_ref = r;
			if (_ref === 7) {
				buf = $appendSlice(buf, new sliceType$6($stringToBytes("\\a")));
			} else if (_ref === 8) {
				buf = $appendSlice(buf, new sliceType$6($stringToBytes("\\b")));
			} else if (_ref === 12) {
				buf = $appendSlice(buf, new sliceType$6($stringToBytes("\\f")));
			} else if (_ref === 10) {
				buf = $appendSlice(buf, new sliceType$6($stringToBytes("\\n")));
			} else if (_ref === 13) {
				buf = $appendSlice(buf, new sliceType$6($stringToBytes("\\r")));
			} else if (_ref === 9) {
				buf = $appendSlice(buf, new sliceType$6($stringToBytes("\\t")));
			} else if (_ref === 11) {
				buf = $appendSlice(buf, new sliceType$6($stringToBytes("\\v")));
			} else {
				if (r < 32) {
					buf = $appendSlice(buf, new sliceType$6($stringToBytes("\\x")));
					buf = $append(buf, "0123456789abcdef".charCodeAt((s.charCodeAt(0) >>> 4 << 24 >>> 24)));
					buf = $append(buf, "0123456789abcdef".charCodeAt(((s.charCodeAt(0) & 15) >>> 0)));
				} else if (r > 1114111) {
					r = 65533;
					buf = $appendSlice(buf, new sliceType$6($stringToBytes("\\u")));
					s$1 = 12;
					while (true) {
						if (!(s$1 >= 0)) { break; }
						buf = $append(buf, "0123456789abcdef".charCodeAt((((r >> $min((s$1 >>> 0), 31)) >> 0) & 15)));
						s$1 = s$1 - (4) >> 0;
					}
				} else if (r < 65536) {
					buf = $appendSlice(buf, new sliceType$6($stringToBytes("\\u")));
					s$1 = 12;
					while (true) {
						if (!(s$1 >= 0)) { break; }
						buf = $append(buf, "0123456789abcdef".charCodeAt((((r >> $min((s$1 >>> 0), 31)) >> 0) & 15)));
						s$1 = s$1 - (4) >> 0;
					}
				} else {
					buf = $appendSlice(buf, new sliceType$6($stringToBytes("\\U")));
					s$2 = 28;
					while (true) {
						if (!(s$2 >= 0)) { break; }
						buf = $append(buf, "0123456789abcdef".charCodeAt((((r >> $min((s$2 >>> 0), 31)) >> 0) & 15)));
						s$2 = s$2 - (4) >> 0;
					}
				}
			}
			s = s.substring(width);
		}
		buf = $append(buf, quote);
		return $bytesToString(buf);
	};
	Quote = $pkg.Quote = function(s) {
		var s;
		return quoteWith(s, 34, false);
	};
	QuoteToASCII = $pkg.QuoteToASCII = function(s) {
		var s;
		return quoteWith(s, 34, true);
	};
	QuoteRune = $pkg.QuoteRune = function(r) {
		var r;
		return quoteWith($encodeRune(r), 39, false);
	};
	AppendQuoteRune = $pkg.AppendQuoteRune = function(dst, r) {
		var dst, r;
		return $appendSlice(dst, new sliceType$6($stringToBytes(QuoteRune(r))));
	};
	QuoteRuneToASCII = $pkg.QuoteRuneToASCII = function(r) {
		var r;
		return quoteWith($encodeRune(r), 39, true);
	};
	AppendQuoteRuneToASCII = $pkg.AppendQuoteRuneToASCII = function(dst, r) {
		var dst, r;
		return $appendSlice(dst, new sliceType$6($stringToBytes(QuoteRuneToASCII(r))));
	};
	CanBackquote = $pkg.CanBackquote = function(s) {
		var _tuple, r, s, wid;
		while (true) {
			if (!(s.length > 0)) { break; }
			_tuple = utf8.DecodeRuneInString(s); r = _tuple[0]; wid = _tuple[1];
			s = s.substring(wid);
			if (wid > 1) {
				if (r === 65279) {
					return false;
				}
				continue;
			}
			if (r === 65533) {
				return false;
			}
			if ((r < 32 && !((r === 9))) || (r === 96) || (r === 127)) {
				return false;
			}
		}
		return true;
	};
	unhex = function(b) {
		var _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, b, c, ok = false, v = 0;
		c = (b >> 0);
		if (48 <= c && c <= 57) {
			_tmp = c - 48 >> 0; _tmp$1 = true; v = _tmp; ok = _tmp$1;
			return [v, ok];
		} else if (97 <= c && c <= 102) {
			_tmp$2 = (c - 97 >> 0) + 10 >> 0; _tmp$3 = true; v = _tmp$2; ok = _tmp$3;
			return [v, ok];
		} else if (65 <= c && c <= 70) {
			_tmp$4 = (c - 65 >> 0) + 10 >> 0; _tmp$5 = true; v = _tmp$4; ok = _tmp$5;
			return [v, ok];
		}
		return [v, ok];
	};
	UnquoteChar = $pkg.UnquoteChar = function(s, quote) {
		var _ref, _ref$1, _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, _tmp$6, _tmp$7, _tuple, _tuple$1, c, c$1, err = $ifaceNil, j, j$1, multibyte = false, n, ok, quote, r, s, size, tail = "", v, v$1, value = 0, x, x$1;
		c = s.charCodeAt(0);
		if ((c === quote) && ((quote === 39) || (quote === 34))) {
			err = $pkg.ErrSyntax;
			return [value, multibyte, tail, err];
		} else if (c >= 128) {
			_tuple = utf8.DecodeRuneInString(s); r = _tuple[0]; size = _tuple[1];
			_tmp = r; _tmp$1 = true; _tmp$2 = s.substring(size); _tmp$3 = $ifaceNil; value = _tmp; multibyte = _tmp$1; tail = _tmp$2; err = _tmp$3;
			return [value, multibyte, tail, err];
		} else if (!((c === 92))) {
			_tmp$4 = (s.charCodeAt(0) >> 0); _tmp$5 = false; _tmp$6 = s.substring(1); _tmp$7 = $ifaceNil; value = _tmp$4; multibyte = _tmp$5; tail = _tmp$6; err = _tmp$7;
			return [value, multibyte, tail, err];
		}
		if (s.length <= 1) {
			err = $pkg.ErrSyntax;
			return [value, multibyte, tail, err];
		}
		c$1 = s.charCodeAt(1);
		s = s.substring(2);
		_ref = c$1;
		switch (0) { default: if (_ref === 97) {
			value = 7;
		} else if (_ref === 98) {
			value = 8;
		} else if (_ref === 102) {
			value = 12;
		} else if (_ref === 110) {
			value = 10;
		} else if (_ref === 114) {
			value = 13;
		} else if (_ref === 116) {
			value = 9;
		} else if (_ref === 118) {
			value = 11;
		} else if (_ref === 120 || _ref === 117 || _ref === 85) {
			n = 0;
			_ref$1 = c$1;
			if (_ref$1 === 120) {
				n = 2;
			} else if (_ref$1 === 117) {
				n = 4;
			} else if (_ref$1 === 85) {
				n = 8;
			}
			v = 0;
			if (s.length < n) {
				err = $pkg.ErrSyntax;
				return [value, multibyte, tail, err];
			}
			j = 0;
			while (true) {
				if (!(j < n)) { break; }
				_tuple$1 = unhex(s.charCodeAt(j)); x = _tuple$1[0]; ok = _tuple$1[1];
				if (!ok) {
					err = $pkg.ErrSyntax;
					return [value, multibyte, tail, err];
				}
				v = (v << 4 >> 0) | x;
				j = j + (1) >> 0;
			}
			s = s.substring(n);
			if (c$1 === 120) {
				value = v;
				break;
			}
			if (v > 1114111) {
				err = $pkg.ErrSyntax;
				return [value, multibyte, tail, err];
			}
			value = v;
			multibyte = true;
		} else if (_ref === 48 || _ref === 49 || _ref === 50 || _ref === 51 || _ref === 52 || _ref === 53 || _ref === 54 || _ref === 55) {
			v$1 = (c$1 >> 0) - 48 >> 0;
			if (s.length < 2) {
				err = $pkg.ErrSyntax;
				return [value, multibyte, tail, err];
			}
			j$1 = 0;
			while (true) {
				if (!(j$1 < 2)) { break; }
				x$1 = (s.charCodeAt(j$1) >> 0) - 48 >> 0;
				if (x$1 < 0 || x$1 > 7) {
					err = $pkg.ErrSyntax;
					return [value, multibyte, tail, err];
				}
				v$1 = ((v$1 << 3 >> 0)) | x$1;
				j$1 = j$1 + (1) >> 0;
			}
			s = s.substring(2);
			if (v$1 > 255) {
				err = $pkg.ErrSyntax;
				return [value, multibyte, tail, err];
			}
			value = v$1;
		} else if (_ref === 92) {
			value = 92;
		} else if (_ref === 39 || _ref === 34) {
			if (!((c$1 === quote))) {
				err = $pkg.ErrSyntax;
				return [value, multibyte, tail, err];
			}
			value = (c$1 >> 0);
		} else {
			err = $pkg.ErrSyntax;
			return [value, multibyte, tail, err];
		} }
		tail = s;
		return [value, multibyte, tail, err];
	};
	Unquote = $pkg.Unquote = function(s) {
		var _q, _ref, _tmp, _tmp$1, _tmp$10, _tmp$11, _tmp$12, _tmp$13, _tmp$14, _tmp$15, _tmp$16, _tmp$17, _tmp$18, _tmp$19, _tmp$2, _tmp$20, _tmp$21, _tmp$3, _tmp$4, _tmp$5, _tmp$6, _tmp$7, _tmp$8, _tmp$9, _tuple, _tuple$1, buf, c, err = $ifaceNil, err$1, multibyte, n, n$1, quote, r, runeTmp, s, size, ss, t = "";
		n = s.length;
		if (n < 2) {
			_tmp = ""; _tmp$1 = $pkg.ErrSyntax; t = _tmp; err = _tmp$1;
			return [t, err];
		}
		quote = s.charCodeAt(0);
		if (!((quote === s.charCodeAt((n - 1 >> 0))))) {
			_tmp$2 = ""; _tmp$3 = $pkg.ErrSyntax; t = _tmp$2; err = _tmp$3;
			return [t, err];
		}
		s = s.substring(1, (n - 1 >> 0));
		if (quote === 96) {
			if (contains(s, 96)) {
				_tmp$4 = ""; _tmp$5 = $pkg.ErrSyntax; t = _tmp$4; err = _tmp$5;
				return [t, err];
			}
			_tmp$6 = s; _tmp$7 = $ifaceNil; t = _tmp$6; err = _tmp$7;
			return [t, err];
		}
		if (!((quote === 34)) && !((quote === 39))) {
			_tmp$8 = ""; _tmp$9 = $pkg.ErrSyntax; t = _tmp$8; err = _tmp$9;
			return [t, err];
		}
		if (contains(s, 10)) {
			_tmp$10 = ""; _tmp$11 = $pkg.ErrSyntax; t = _tmp$10; err = _tmp$11;
			return [t, err];
		}
		if (!contains(s, 92) && !contains(s, quote)) {
			_ref = quote;
			if (_ref === 34) {
				_tmp$12 = s; _tmp$13 = $ifaceNil; t = _tmp$12; err = _tmp$13;
				return [t, err];
			} else if (_ref === 39) {
				_tuple = utf8.DecodeRuneInString(s); r = _tuple[0]; size = _tuple[1];
				if ((size === s.length) && (!((r === 65533)) || !((size === 1)))) {
					_tmp$14 = s; _tmp$15 = $ifaceNil; t = _tmp$14; err = _tmp$15;
					return [t, err];
				}
			}
		}
		runeTmp = $clone(arrayType$5.zero(), arrayType$5);
		buf = $makeSlice(sliceType$6, 0, (_q = (3 * s.length >> 0) / 2, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero")));
		while (true) {
			if (!(s.length > 0)) { break; }
			_tuple$1 = UnquoteChar(s, quote); c = _tuple$1[0]; multibyte = _tuple$1[1]; ss = _tuple$1[2]; err$1 = _tuple$1[3];
			if (!($interfaceIsEqual(err$1, $ifaceNil))) {
				_tmp$16 = ""; _tmp$17 = err$1; t = _tmp$16; err = _tmp$17;
				return [t, err];
			}
			s = ss;
			if (c < 128 || !multibyte) {
				buf = $append(buf, (c << 24 >>> 24));
			} else {
				n$1 = utf8.EncodeRune(new sliceType$6(runeTmp), c);
				buf = $appendSlice(buf, $subslice(new sliceType$6(runeTmp), 0, n$1));
			}
			if ((quote === 39) && !((s.length === 0))) {
				_tmp$18 = ""; _tmp$19 = $pkg.ErrSyntax; t = _tmp$18; err = _tmp$19;
				return [t, err];
			}
		}
		_tmp$20 = $bytesToString(buf); _tmp$21 = $ifaceNil; t = _tmp$20; err = _tmp$21;
		return [t, err];
	};
	contains = function(s, c) {
		var c, i, s;
		i = 0;
		while (true) {
			if (!(i < s.length)) { break; }
			if (s.charCodeAt(i) === c) {
				return true;
			}
			i = i + (1) >> 0;
		}
		return false;
	};
	bsearch16 = function(a, x) {
		var _q, _tmp, _tmp$1, a, h, i, j, x;
		_tmp = 0; _tmp$1 = a.$length; i = _tmp; j = _tmp$1;
		while (true) {
			if (!(i < j)) { break; }
			h = i + (_q = ((j - i >> 0)) / 2, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero")) >> 0;
			if (((h < 0 || h >= a.$length) ? $throwRuntimeError("index out of range") : a.$array[a.$offset + h]) < x) {
				i = h + 1 >> 0;
			} else {
				j = h;
			}
		}
		return i;
	};
	bsearch32 = function(a, x) {
		var _q, _tmp, _tmp$1, a, h, i, j, x;
		_tmp = 0; _tmp$1 = a.$length; i = _tmp; j = _tmp$1;
		while (true) {
			if (!(i < j)) { break; }
			h = i + (_q = ((j - i >> 0)) / 2, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero")) >> 0;
			if (((h < 0 || h >= a.$length) ? $throwRuntimeError("index out of range") : a.$array[a.$offset + h]) < x) {
				i = h + 1 >> 0;
			} else {
				j = h;
			}
		}
		return i;
	};
	IsPrint = $pkg.IsPrint = function(r) {
		var _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, i, i$1, isNotPrint, isNotPrint$1, isPrint, isPrint$1, j, j$1, r, rr, rr$1, x, x$1, x$2, x$3;
		if (r <= 255) {
			if (32 <= r && r <= 126) {
				return true;
			}
			if (161 <= r && r <= 255) {
				return !((r === 173));
			}
			return false;
		}
		if (0 <= r && r < 65536) {
			_tmp = (r << 16 >>> 16); _tmp$1 = isPrint16; _tmp$2 = isNotPrint16; rr = _tmp; isPrint = _tmp$1; isNotPrint = _tmp$2;
			i = bsearch16(isPrint, rr);
			if (i >= isPrint.$length || rr < (x = i & ~1, ((x < 0 || x >= isPrint.$length) ? $throwRuntimeError("index out of range") : isPrint.$array[isPrint.$offset + x])) || (x$1 = i | 1, ((x$1 < 0 || x$1 >= isPrint.$length) ? $throwRuntimeError("index out of range") : isPrint.$array[isPrint.$offset + x$1])) < rr) {
				return false;
			}
			j = bsearch16(isNotPrint, rr);
			return j >= isNotPrint.$length || !((((j < 0 || j >= isNotPrint.$length) ? $throwRuntimeError("index out of range") : isNotPrint.$array[isNotPrint.$offset + j]) === rr));
		}
		_tmp$3 = (r >>> 0); _tmp$4 = isPrint32; _tmp$5 = isNotPrint32; rr$1 = _tmp$3; isPrint$1 = _tmp$4; isNotPrint$1 = _tmp$5;
		i$1 = bsearch32(isPrint$1, rr$1);
		if (i$1 >= isPrint$1.$length || rr$1 < (x$2 = i$1 & ~1, ((x$2 < 0 || x$2 >= isPrint$1.$length) ? $throwRuntimeError("index out of range") : isPrint$1.$array[isPrint$1.$offset + x$2])) || (x$3 = i$1 | 1, ((x$3 < 0 || x$3 >= isPrint$1.$length) ? $throwRuntimeError("index out of range") : isPrint$1.$array[isPrint$1.$offset + x$3])) < rr$1) {
			return false;
		}
		if (r >= 131072) {
			return true;
		}
		r = r - (65536) >> 0;
		j$1 = bsearch16(isNotPrint$1, (r << 16 >>> 16));
		return j$1 >= isNotPrint$1.$length || !((((j$1 < 0 || j$1 >= isNotPrint$1.$length) ? $throwRuntimeError("index out of range") : isNotPrint$1.$array[isNotPrint$1.$offset + j$1]) === (r << 16 >>> 16)));
	};
	ptrType$2.methods = [{prop: "set", name: "set", pkg: "strconv", typ: $funcType([$String], [$Bool], false)}, {prop: "floatBits", name: "floatBits", pkg: "strconv", typ: $funcType([ptrType$1], [$Uint64, $Bool], false)}, {prop: "String", name: "String", pkg: "", typ: $funcType([], [$String], false)}, {prop: "Assign", name: "Assign", pkg: "", typ: $funcType([$Uint64], [], false)}, {prop: "Shift", name: "Shift", pkg: "", typ: $funcType([$Int], [], false)}, {prop: "Round", name: "Round", pkg: "", typ: $funcType([$Int], [], false)}, {prop: "RoundDown", name: "RoundDown", pkg: "", typ: $funcType([$Int], [], false)}, {prop: "RoundUp", name: "RoundUp", pkg: "", typ: $funcType([$Int], [], false)}, {prop: "RoundedInteger", name: "RoundedInteger", pkg: "", typ: $funcType([], [$Uint64], false)}];
	ptrType$4.methods = [{prop: "floatBits", name: "floatBits", pkg: "strconv", typ: $funcType([ptrType$1], [$Uint64, $Bool], false)}, {prop: "AssignComputeBounds", name: "AssignComputeBounds", pkg: "", typ: $funcType([$Uint64, $Int, $Bool, ptrType$1], [extFloat, extFloat], false)}, {prop: "Normalize", name: "Normalize", pkg: "", typ: $funcType([], [$Uint], false)}, {prop: "Multiply", name: "Multiply", pkg: "", typ: $funcType([extFloat], [], false)}, {prop: "AssignDecimal", name: "AssignDecimal", pkg: "", typ: $funcType([$Uint64, $Int, $Bool, $Bool, ptrType$1], [$Bool], false)}, {prop: "frexp10", name: "frexp10", pkg: "strconv", typ: $funcType([], [$Int, $Int], false)}, {prop: "FixedDecimal", name: "FixedDecimal", pkg: "", typ: $funcType([ptrType$3, $Int], [$Bool], false)}, {prop: "ShortestDecimal", name: "ShortestDecimal", pkg: "", typ: $funcType([ptrType$3, ptrType$4, ptrType$4], [$Bool], false)}];
	decimal.init([{prop: "d", name: "d", pkg: "strconv", typ: arrayType$6, tag: ""}, {prop: "nd", name: "nd", pkg: "strconv", typ: $Int, tag: ""}, {prop: "dp", name: "dp", pkg: "strconv", typ: $Int, tag: ""}, {prop: "neg", name: "neg", pkg: "strconv", typ: $Bool, tag: ""}, {prop: "trunc", name: "trunc", pkg: "strconv", typ: $Bool, tag: ""}]);
	leftCheat.init([{prop: "delta", name: "delta", pkg: "strconv", typ: $Int, tag: ""}, {prop: "cutoff", name: "cutoff", pkg: "strconv", typ: $String, tag: ""}]);
	extFloat.init([{prop: "mant", name: "mant", pkg: "strconv", typ: $Uint64, tag: ""}, {prop: "exp", name: "exp", pkg: "strconv", typ: $Int, tag: ""}, {prop: "neg", name: "neg", pkg: "strconv", typ: $Bool, tag: ""}]);
	floatInfo.init([{prop: "mantbits", name: "mantbits", pkg: "strconv", typ: $Uint, tag: ""}, {prop: "expbits", name: "expbits", pkg: "strconv", typ: $Uint, tag: ""}, {prop: "bias", name: "bias", pkg: "strconv", typ: $Int, tag: ""}]);
	decimalSlice.init([{prop: "d", name: "d", pkg: "strconv", typ: sliceType$6, tag: ""}, {prop: "nd", name: "nd", pkg: "strconv", typ: $Int, tag: ""}, {prop: "dp", name: "dp", pkg: "strconv", typ: $Int, tag: ""}, {prop: "neg", name: "neg", pkg: "strconv", typ: $Bool, tag: ""}]);
	$pkg.$init = function() {
		$pkg.$init = function() {};
		/* */ var $r, $s = 0; var $init_strconv = function() { while (true) { switch ($s) { case 0:
		$r = errors.$init($BLOCKING); /* */ $s = 1; case 1: if ($r && $r.$blocking) { $r = $r(); }
		$r = math.$init($BLOCKING); /* */ $s = 2; case 2: if ($r && $r.$blocking) { $r = $r(); }
		$r = utf8.$init($BLOCKING); /* */ $s = 3; case 3: if ($r && $r.$blocking) { $r = $r(); }
		optimize = true;
		$pkg.ErrRange = errors.New("value out of range");
		$pkg.ErrSyntax = errors.New("invalid syntax");
		leftcheats = new sliceType$3([new leftCheat.ptr(0, ""), new leftCheat.ptr(1, "5"), new leftCheat.ptr(1, "25"), new leftCheat.ptr(1, "125"), new leftCheat.ptr(2, "625"), new leftCheat.ptr(2, "3125"), new leftCheat.ptr(2, "15625"), new leftCheat.ptr(3, "78125"), new leftCheat.ptr(3, "390625"), new leftCheat.ptr(3, "1953125"), new leftCheat.ptr(4, "9765625"), new leftCheat.ptr(4, "48828125"), new leftCheat.ptr(4, "244140625"), new leftCheat.ptr(4, "1220703125"), new leftCheat.ptr(5, "6103515625"), new leftCheat.ptr(5, "30517578125"), new leftCheat.ptr(5, "152587890625"), new leftCheat.ptr(6, "762939453125"), new leftCheat.ptr(6, "3814697265625"), new leftCheat.ptr(6, "19073486328125"), new leftCheat.ptr(7, "95367431640625"), new leftCheat.ptr(7, "476837158203125"), new leftCheat.ptr(7, "2384185791015625"), new leftCheat.ptr(7, "11920928955078125"), new leftCheat.ptr(8, "59604644775390625"), new leftCheat.ptr(8, "298023223876953125"), new leftCheat.ptr(8, "1490116119384765625"), new leftCheat.ptr(9, "7450580596923828125")]);
		smallPowersOfTen = $toNativeArray($kindStruct, [new extFloat.ptr(new $Uint64(2147483648, 0), -63, false), new extFloat.ptr(new $Uint64(2684354560, 0), -60, false), new extFloat.ptr(new $Uint64(3355443200, 0), -57, false), new extFloat.ptr(new $Uint64(4194304000, 0), -54, false), new extFloat.ptr(new $Uint64(2621440000, 0), -50, false), new extFloat.ptr(new $Uint64(3276800000, 0), -47, false), new extFloat.ptr(new $Uint64(4096000000, 0), -44, false), new extFloat.ptr(new $Uint64(2560000000, 0), -40, false)]);
		powersOfTen = $toNativeArray($kindStruct, [new extFloat.ptr(new $Uint64(4203730336, 136053384), -1220, false), new extFloat.ptr(new $Uint64(3132023167, 2722021238), -1193, false), new extFloat.ptr(new $Uint64(2333539104, 810921078), -1166, false), new extFloat.ptr(new $Uint64(3477244234, 1573795306), -1140, false), new extFloat.ptr(new $Uint64(2590748842, 1432697645), -1113, false), new extFloat.ptr(new $Uint64(3860516611, 1025131999), -1087, false), new extFloat.ptr(new $Uint64(2876309015, 3348809418), -1060, false), new extFloat.ptr(new $Uint64(4286034428, 3200048207), -1034, false), new extFloat.ptr(new $Uint64(3193344495, 1097586188), -1007, false), new extFloat.ptr(new $Uint64(2379227053, 2424306748), -980, false), new extFloat.ptr(new $Uint64(3545324584, 827693699), -954, false), new extFloat.ptr(new $Uint64(2641472655, 2913388981), -927, false), new extFloat.ptr(new $Uint64(3936100983, 602835915), -901, false), new extFloat.ptr(new $Uint64(2932623761, 1081627501), -874, false), new extFloat.ptr(new $Uint64(2184974969, 1572261463), -847, false), new extFloat.ptr(new $Uint64(3255866422, 1308317239), -821, false), new extFloat.ptr(new $Uint64(2425809519, 944281679), -794, false), new extFloat.ptr(new $Uint64(3614737867, 629291719), -768, false), new extFloat.ptr(new $Uint64(2693189581, 2545915892), -741, false), new extFloat.ptr(new $Uint64(4013165208, 388672741), -715, false), new extFloat.ptr(new $Uint64(2990041083, 708162190), -688, false), new extFloat.ptr(new $Uint64(2227754207, 3536207675), -661, false), new extFloat.ptr(new $Uint64(3319612455, 450088378), -635, false), new extFloat.ptr(new $Uint64(2473304014, 3139815830), -608, false), new extFloat.ptr(new $Uint64(3685510180, 2103616900), -582, false), new extFloat.ptr(new $Uint64(2745919064, 224385782), -555, false), new extFloat.ptr(new $Uint64(4091738259, 3737383206), -529, false), new extFloat.ptr(new $Uint64(3048582568, 2868871352), -502, false), new extFloat.ptr(new $Uint64(2271371013, 1820084875), -475, false), new extFloat.ptr(new $Uint64(3384606560, 885076051), -449, false), new extFloat.ptr(new $Uint64(2521728396, 2444895829), -422, false), new extFloat.ptr(new $Uint64(3757668132, 1881767613), -396, false), new extFloat.ptr(new $Uint64(2799680927, 3102062735), -369, false), new extFloat.ptr(new $Uint64(4171849679, 2289335700), -343, false), new extFloat.ptr(new $Uint64(3108270227, 2410191823), -316, false), new extFloat.ptr(new $Uint64(2315841784, 3205436779), -289, false), new extFloat.ptr(new $Uint64(3450873173, 1697722806), -263, false), new extFloat.ptr(new $Uint64(2571100870, 3497754540), -236, false), new extFloat.ptr(new $Uint64(3831238852, 707476230), -210, false), new extFloat.ptr(new $Uint64(2854495385, 1769181907), -183, false), new extFloat.ptr(new $Uint64(4253529586, 2197867022), -157, false), new extFloat.ptr(new $Uint64(3169126500, 2450594539), -130, false), new extFloat.ptr(new $Uint64(2361183241, 1867548876), -103, false), new extFloat.ptr(new $Uint64(3518437208, 3793315116), -77, false), new extFloat.ptr(new $Uint64(2621440000, 0), -50, false), new extFloat.ptr(new $Uint64(3906250000, 0), -24, false), new extFloat.ptr(new $Uint64(2910383045, 2892103680), 3, false), new extFloat.ptr(new $Uint64(2168404344, 4170451332), 30, false), new extFloat.ptr(new $Uint64(3231174267, 3372684723), 56, false), new extFloat.ptr(new $Uint64(2407412430, 2078956656), 83, false), new extFloat.ptr(new $Uint64(3587324068, 2884206696), 109, false), new extFloat.ptr(new $Uint64(2672764710, 395977285), 136, false), new extFloat.ptr(new $Uint64(3982729777, 3569679143), 162, false), new extFloat.ptr(new $Uint64(2967364920, 2361961896), 189, false), new extFloat.ptr(new $Uint64(2210859150, 447440347), 216, false), new extFloat.ptr(new $Uint64(3294436857, 1114709402), 242, false), new extFloat.ptr(new $Uint64(2454546732, 2786846552), 269, false), new extFloat.ptr(new $Uint64(3657559652, 443583978), 295, false), new extFloat.ptr(new $Uint64(2725094297, 2599384906), 322, false), new extFloat.ptr(new $Uint64(4060706939, 3028118405), 348, false), new extFloat.ptr(new $Uint64(3025462433, 2044532855), 375, false), new extFloat.ptr(new $Uint64(2254145170, 1536935362), 402, false), new extFloat.ptr(new $Uint64(3358938053, 3365297469), 428, false), new extFloat.ptr(new $Uint64(2502603868, 4204241075), 455, false), new extFloat.ptr(new $Uint64(3729170365, 2577424355), 481, false), new extFloat.ptr(new $Uint64(2778448436, 3677981733), 508, false), new extFloat.ptr(new $Uint64(4140210802, 2744688476), 534, false), new extFloat.ptr(new $Uint64(3084697427, 1424604878), 561, false), new extFloat.ptr(new $Uint64(2298278679, 4062331362), 588, false), new extFloat.ptr(new $Uint64(3424702107, 3546052773), 614, false), new extFloat.ptr(new $Uint64(2551601907, 2065781727), 641, false), new extFloat.ptr(new $Uint64(3802183132, 2535403578), 667, false), new extFloat.ptr(new $Uint64(2832847187, 1558426518), 694, false), new extFloat.ptr(new $Uint64(4221271257, 2762425404), 720, false), new extFloat.ptr(new $Uint64(3145092172, 2812560400), 747, false), new extFloat.ptr(new $Uint64(2343276271, 3057687578), 774, false), new extFloat.ptr(new $Uint64(3491753744, 2790753324), 800, false), new extFloat.ptr(new $Uint64(2601559269, 3918606633), 827, false), new extFloat.ptr(new $Uint64(3876625403, 2711358621), 853, false), new extFloat.ptr(new $Uint64(2888311001, 1648096297), 880, false), new extFloat.ptr(new $Uint64(2151959390, 2057817989), 907, false), new extFloat.ptr(new $Uint64(3206669376, 61660461), 933, false), new extFloat.ptr(new $Uint64(2389154863, 1581580175), 960, false), new extFloat.ptr(new $Uint64(3560118173, 2626467905), 986, false), new extFloat.ptr(new $Uint64(2652494738, 3034782633), 1013, false), new extFloat.ptr(new $Uint64(3952525166, 3135207385), 1039, false), new extFloat.ptr(new $Uint64(2944860731, 2616258155), 1066, false)]);
		uint64pow10 = $toNativeArray($kindUint64, [new $Uint64(0, 1), new $Uint64(0, 10), new $Uint64(0, 100), new $Uint64(0, 1000), new $Uint64(0, 10000), new $Uint64(0, 100000), new $Uint64(0, 1000000), new $Uint64(0, 10000000), new $Uint64(0, 100000000), new $Uint64(0, 1000000000), new $Uint64(2, 1410065408), new $Uint64(23, 1215752192), new $Uint64(232, 3567587328), new $Uint64(2328, 1316134912), new $Uint64(23283, 276447232), new $Uint64(232830, 2764472320), new $Uint64(2328306, 1874919424), new $Uint64(23283064, 1569325056), new $Uint64(232830643, 2808348672), new $Uint64(2328306436, 2313682944)]);
		float32info = new floatInfo.ptr(23, 8, -127);
		float64info = new floatInfo.ptr(52, 11, -1023);
		isPrint16 = new sliceType$4([32, 126, 161, 887, 890, 895, 900, 1366, 1369, 1418, 1421, 1479, 1488, 1514, 1520, 1524, 1542, 1563, 1566, 1805, 1808, 1866, 1869, 1969, 1984, 2042, 2048, 2093, 2096, 2139, 2142, 2142, 2208, 2226, 2276, 2444, 2447, 2448, 2451, 2482, 2486, 2489, 2492, 2500, 2503, 2504, 2507, 2510, 2519, 2519, 2524, 2531, 2534, 2555, 2561, 2570, 2575, 2576, 2579, 2617, 2620, 2626, 2631, 2632, 2635, 2637, 2641, 2641, 2649, 2654, 2662, 2677, 2689, 2745, 2748, 2765, 2768, 2768, 2784, 2787, 2790, 2801, 2817, 2828, 2831, 2832, 2835, 2873, 2876, 2884, 2887, 2888, 2891, 2893, 2902, 2903, 2908, 2915, 2918, 2935, 2946, 2954, 2958, 2965, 2969, 2975, 2979, 2980, 2984, 2986, 2990, 3001, 3006, 3010, 3014, 3021, 3024, 3024, 3031, 3031, 3046, 3066, 3072, 3129, 3133, 3149, 3157, 3161, 3168, 3171, 3174, 3183, 3192, 3257, 3260, 3277, 3285, 3286, 3294, 3299, 3302, 3314, 3329, 3386, 3389, 3406, 3415, 3415, 3424, 3427, 3430, 3445, 3449, 3455, 3458, 3478, 3482, 3517, 3520, 3526, 3530, 3530, 3535, 3551, 3558, 3567, 3570, 3572, 3585, 3642, 3647, 3675, 3713, 3716, 3719, 3722, 3725, 3725, 3732, 3751, 3754, 3773, 3776, 3789, 3792, 3801, 3804, 3807, 3840, 3948, 3953, 4058, 4096, 4295, 4301, 4301, 4304, 4685, 4688, 4701, 4704, 4749, 4752, 4789, 4792, 4805, 4808, 4885, 4888, 4954, 4957, 4988, 4992, 5017, 5024, 5108, 5120, 5788, 5792, 5880, 5888, 5908, 5920, 5942, 5952, 5971, 5984, 6003, 6016, 6109, 6112, 6121, 6128, 6137, 6144, 6157, 6160, 6169, 6176, 6263, 6272, 6314, 6320, 6389, 6400, 6443, 6448, 6459, 6464, 6464, 6468, 6509, 6512, 6516, 6528, 6571, 6576, 6601, 6608, 6618, 6622, 6683, 6686, 6780, 6783, 6793, 6800, 6809, 6816, 6829, 6832, 6846, 6912, 6987, 6992, 7036, 7040, 7155, 7164, 7223, 7227, 7241, 7245, 7295, 7360, 7367, 7376, 7417, 7424, 7669, 7676, 7957, 7960, 7965, 7968, 8005, 8008, 8013, 8016, 8061, 8064, 8147, 8150, 8175, 8178, 8190, 8208, 8231, 8240, 8286, 8304, 8305, 8308, 8348, 8352, 8381, 8400, 8432, 8448, 8585, 8592, 9210, 9216, 9254, 9280, 9290, 9312, 11123, 11126, 11157, 11160, 11193, 11197, 11217, 11264, 11507, 11513, 11559, 11565, 11565, 11568, 11623, 11631, 11632, 11647, 11670, 11680, 11842, 11904, 12019, 12032, 12245, 12272, 12283, 12289, 12438, 12441, 12543, 12549, 12589, 12593, 12730, 12736, 12771, 12784, 19893, 19904, 40908, 40960, 42124, 42128, 42182, 42192, 42539, 42560, 42743, 42752, 42925, 42928, 42929, 42999, 43051, 43056, 43065, 43072, 43127, 43136, 43204, 43214, 43225, 43232, 43259, 43264, 43347, 43359, 43388, 43392, 43481, 43486, 43574, 43584, 43597, 43600, 43609, 43612, 43714, 43739, 43766, 43777, 43782, 43785, 43790, 43793, 43798, 43808, 43871, 43876, 43877, 43968, 44013, 44016, 44025, 44032, 55203, 55216, 55238, 55243, 55291, 63744, 64109, 64112, 64217, 64256, 64262, 64275, 64279, 64285, 64449, 64467, 64831, 64848, 64911, 64914, 64967, 65008, 65021, 65024, 65049, 65056, 65069, 65072, 65131, 65136, 65276, 65281, 65470, 65474, 65479, 65482, 65487, 65490, 65495, 65498, 65500, 65504, 65518, 65532, 65533]);
		isNotPrint16 = new sliceType$4([173, 907, 909, 930, 1328, 1376, 1416, 1424, 1757, 2111, 2436, 2473, 2481, 2526, 2564, 2601, 2609, 2612, 2615, 2621, 2653, 2692, 2702, 2706, 2729, 2737, 2740, 2758, 2762, 2820, 2857, 2865, 2868, 2910, 2948, 2961, 2971, 2973, 3017, 3076, 3085, 3089, 3113, 3141, 3145, 3159, 3200, 3204, 3213, 3217, 3241, 3252, 3269, 3273, 3295, 3312, 3332, 3341, 3345, 3397, 3401, 3460, 3506, 3516, 3541, 3543, 3715, 3721, 3736, 3744, 3748, 3750, 3756, 3770, 3781, 3783, 3912, 3992, 4029, 4045, 4294, 4681, 4695, 4697, 4745, 4785, 4799, 4801, 4823, 4881, 5760, 5901, 5997, 6001, 6431, 6751, 7415, 8024, 8026, 8028, 8030, 8117, 8133, 8156, 8181, 8335, 11209, 11311, 11359, 11558, 11687, 11695, 11703, 11711, 11719, 11727, 11735, 11743, 11930, 12352, 12687, 12831, 13055, 42654, 42895, 43470, 43519, 43815, 43823, 64311, 64317, 64319, 64322, 64325, 65107, 65127, 65141, 65511]);
		isPrint32 = new sliceType$5([65536, 65613, 65616, 65629, 65664, 65786, 65792, 65794, 65799, 65843, 65847, 65932, 65936, 65947, 65952, 65952, 66000, 66045, 66176, 66204, 66208, 66256, 66272, 66299, 66304, 66339, 66352, 66378, 66384, 66426, 66432, 66499, 66504, 66517, 66560, 66717, 66720, 66729, 66816, 66855, 66864, 66915, 66927, 66927, 67072, 67382, 67392, 67413, 67424, 67431, 67584, 67589, 67592, 67640, 67644, 67644, 67647, 67742, 67751, 67759, 67840, 67867, 67871, 67897, 67903, 67903, 67968, 68023, 68030, 68031, 68096, 68102, 68108, 68147, 68152, 68154, 68159, 68167, 68176, 68184, 68192, 68255, 68288, 68326, 68331, 68342, 68352, 68405, 68409, 68437, 68440, 68466, 68472, 68497, 68505, 68508, 68521, 68527, 68608, 68680, 69216, 69246, 69632, 69709, 69714, 69743, 69759, 69825, 69840, 69864, 69872, 69881, 69888, 69955, 69968, 70006, 70016, 70088, 70093, 70093, 70096, 70106, 70113, 70132, 70144, 70205, 70320, 70378, 70384, 70393, 70401, 70412, 70415, 70416, 70419, 70457, 70460, 70468, 70471, 70472, 70475, 70477, 70487, 70487, 70493, 70499, 70502, 70508, 70512, 70516, 70784, 70855, 70864, 70873, 71040, 71093, 71096, 71113, 71168, 71236, 71248, 71257, 71296, 71351, 71360, 71369, 71840, 71922, 71935, 71935, 72384, 72440, 73728, 74648, 74752, 74868, 77824, 78894, 92160, 92728, 92736, 92777, 92782, 92783, 92880, 92909, 92912, 92917, 92928, 92997, 93008, 93047, 93053, 93071, 93952, 94020, 94032, 94078, 94095, 94111, 110592, 110593, 113664, 113770, 113776, 113788, 113792, 113800, 113808, 113817, 113820, 113823, 118784, 119029, 119040, 119078, 119081, 119154, 119163, 119261, 119296, 119365, 119552, 119638, 119648, 119665, 119808, 119967, 119970, 119970, 119973, 119974, 119977, 120074, 120077, 120134, 120138, 120485, 120488, 120779, 120782, 120831, 124928, 125124, 125127, 125142, 126464, 126500, 126503, 126523, 126530, 126530, 126535, 126548, 126551, 126564, 126567, 126619, 126625, 126651, 126704, 126705, 126976, 127019, 127024, 127123, 127136, 127150, 127153, 127221, 127232, 127244, 127248, 127339, 127344, 127386, 127462, 127490, 127504, 127546, 127552, 127560, 127568, 127569, 127744, 127788, 127792, 127869, 127872, 127950, 127956, 127991, 128000, 128330, 128336, 128578, 128581, 128719, 128736, 128748, 128752, 128755, 128768, 128883, 128896, 128980, 129024, 129035, 129040, 129095, 129104, 129113, 129120, 129159, 129168, 129197, 131072, 173782, 173824, 177972, 177984, 178205, 194560, 195101, 917760, 917999]);
		isNotPrint32 = new sliceType$4([12, 39, 59, 62, 926, 2057, 2102, 2134, 2564, 2580, 2584, 4285, 4405, 4626, 4868, 4905, 4913, 4916, 9327, 27231, 27482, 27490, 54357, 54429, 54445, 54458, 54460, 54468, 54534, 54549, 54557, 54586, 54591, 54597, 54609, 60932, 60960, 60963, 60968, 60979, 60984, 60986, 61000, 61002, 61004, 61008, 61011, 61016, 61018, 61020, 61022, 61024, 61027, 61035, 61043, 61048, 61053, 61055, 61066, 61092, 61098, 61632, 61648, 61743, 62719, 62842, 62884]);
		shifts = $toNativeArray($kindUint, [0, 0, 1, 0, 2, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 0]);
		/* */ } return; } }; $init_strconv.$blocking = true; return $init_strconv;
	};
	return $pkg;
})();
$packages["reflect"] = (function() {
	var $pkg = {}, js, math, runtime, strconv, sync, mapIter, Type, Kind, rtype, typeAlg, method, uncommonType, ChanDir, arrayType, chanType, funcType, imethod, interfaceType, mapType, ptrType, sliceType, structField, structType, Method, StructField, StructTag, fieldScan, Value, flag, ValueError, nonEmptyInterface, ptrType$1, sliceType$1, ptrType$3, arrayType$1, ptrType$4, ptrType$5, sliceType$2, sliceType$3, sliceType$4, sliceType$5, structType$5, sliceType$6, ptrType$6, arrayType$2, structType$6, ptrType$7, sliceType$7, ptrType$8, ptrType$9, ptrType$10, ptrType$11, sliceType$9, sliceType$10, ptrType$12, ptrType$17, sliceType$12, sliceType$13, funcType$2, funcType$3, funcType$4, arrayType$3, ptrType$20, initialized, stringPtrMap, jsObject, jsContainer, kindNames, uint8Type, init, jsType, reflectType, setKindType, newStringPtr, isWrapped, copyStruct, makeValue, MakeSlice, TypeOf, ValueOf, SliceOf, Zero, unsafe_New, makeInt, memmove, mapaccess, mapassign, mapdelete, mapiterinit, mapiterkey, mapiternext, maplen, cvtDirect, methodReceiver, valueInterface, ifaceE2I, methodName, makeMethodValue, wrapJsObject, unwrapJsObject, PtrTo, implements$1, directlyAssignable, haveIdenticalUnderlyingType, toType, ifaceIndir, overflowFloat32, New, convertOp, makeFloat, makeComplex, makeString, makeBytes, makeRunes, cvtInt, cvtUint, cvtFloatInt, cvtFloatUint, cvtIntFloat, cvtUintFloat, cvtFloat, cvtComplex, cvtIntString, cvtUintString, cvtBytesString, cvtStringBytes, cvtRunesString, cvtStringRunes, cvtT2I, cvtI2I;
	js = $packages["github.com/gopherjs/gopherjs/js"];
	math = $packages["math"];
	runtime = $packages["runtime"];
	strconv = $packages["strconv"];
	sync = $packages["sync"];
	mapIter = $pkg.mapIter = $newType(0, $kindStruct, "reflect.mapIter", "mapIter", "reflect", function(t_, m_, keys_, i_) {
		this.$val = this;
		this.t = t_ !== undefined ? t_ : $ifaceNil;
		this.m = m_ !== undefined ? m_ : null;
		this.keys = keys_ !== undefined ? keys_ : null;
		this.i = i_ !== undefined ? i_ : 0;
	});
	Type = $pkg.Type = $newType(8, $kindInterface, "reflect.Type", "Type", "reflect", null);
	Kind = $pkg.Kind = $newType(4, $kindUint, "reflect.Kind", "Kind", "reflect", null);
	rtype = $pkg.rtype = $newType(0, $kindStruct, "reflect.rtype", "rtype", "reflect", function(size_, hash_, _$2_, align_, fieldAlign_, kind_, alg_, gc_, string_, uncommonType_, ptrToThis_, zero_) {
		this.$val = this;
		this.size = size_ !== undefined ? size_ : 0;
		this.hash = hash_ !== undefined ? hash_ : 0;
		this._$2 = _$2_ !== undefined ? _$2_ : 0;
		this.align = align_ !== undefined ? align_ : 0;
		this.fieldAlign = fieldAlign_ !== undefined ? fieldAlign_ : 0;
		this.kind = kind_ !== undefined ? kind_ : 0;
		this.alg = alg_ !== undefined ? alg_ : ptrType$3.nil;
		this.gc = gc_ !== undefined ? gc_ : arrayType$1.zero();
		this.string = string_ !== undefined ? string_ : ptrType$4.nil;
		this.uncommonType = uncommonType_ !== undefined ? uncommonType_ : ptrType$5.nil;
		this.ptrToThis = ptrToThis_ !== undefined ? ptrToThis_ : ptrType$1.nil;
		this.zero = zero_ !== undefined ? zero_ : 0;
	});
	typeAlg = $pkg.typeAlg = $newType(0, $kindStruct, "reflect.typeAlg", "typeAlg", "reflect", function(hash_, equal_) {
		this.$val = this;
		this.hash = hash_ !== undefined ? hash_ : $throwNilPointerError;
		this.equal = equal_ !== undefined ? equal_ : $throwNilPointerError;
	});
	method = $pkg.method = $newType(0, $kindStruct, "reflect.method", "method", "reflect", function(name_, pkgPath_, mtyp_, typ_, ifn_, tfn_) {
		this.$val = this;
		this.name = name_ !== undefined ? name_ : ptrType$4.nil;
		this.pkgPath = pkgPath_ !== undefined ? pkgPath_ : ptrType$4.nil;
		this.mtyp = mtyp_ !== undefined ? mtyp_ : ptrType$1.nil;
		this.typ = typ_ !== undefined ? typ_ : ptrType$1.nil;
		this.ifn = ifn_ !== undefined ? ifn_ : 0;
		this.tfn = tfn_ !== undefined ? tfn_ : 0;
	});
	uncommonType = $pkg.uncommonType = $newType(0, $kindStruct, "reflect.uncommonType", "uncommonType", "reflect", function(name_, pkgPath_, methods_) {
		this.$val = this;
		this.name = name_ !== undefined ? name_ : ptrType$4.nil;
		this.pkgPath = pkgPath_ !== undefined ? pkgPath_ : ptrType$4.nil;
		this.methods = methods_ !== undefined ? methods_ : sliceType$2.nil;
	});
	ChanDir = $pkg.ChanDir = $newType(4, $kindInt, "reflect.ChanDir", "ChanDir", "reflect", null);
	arrayType = $pkg.arrayType = $newType(0, $kindStruct, "reflect.arrayType", "arrayType", "reflect", function(rtype_, elem_, slice_, len_) {
		this.$val = this;
		this.rtype = rtype_ !== undefined ? rtype_ : new rtype.ptr();
		this.elem = elem_ !== undefined ? elem_ : ptrType$1.nil;
		this.slice = slice_ !== undefined ? slice_ : ptrType$1.nil;
		this.len = len_ !== undefined ? len_ : 0;
	});
	chanType = $pkg.chanType = $newType(0, $kindStruct, "reflect.chanType", "chanType", "reflect", function(rtype_, elem_, dir_) {
		this.$val = this;
		this.rtype = rtype_ !== undefined ? rtype_ : new rtype.ptr();
		this.elem = elem_ !== undefined ? elem_ : ptrType$1.nil;
		this.dir = dir_ !== undefined ? dir_ : 0;
	});
	funcType = $pkg.funcType = $newType(0, $kindStruct, "reflect.funcType", "funcType", "reflect", function(rtype_, dotdotdot_, in$2_, out_) {
		this.$val = this;
		this.rtype = rtype_ !== undefined ? rtype_ : new rtype.ptr();
		this.dotdotdot = dotdotdot_ !== undefined ? dotdotdot_ : false;
		this.in$2 = in$2_ !== undefined ? in$2_ : sliceType$3.nil;
		this.out = out_ !== undefined ? out_ : sliceType$3.nil;
	});
	imethod = $pkg.imethod = $newType(0, $kindStruct, "reflect.imethod", "imethod", "reflect", function(name_, pkgPath_, typ_) {
		this.$val = this;
		this.name = name_ !== undefined ? name_ : ptrType$4.nil;
		this.pkgPath = pkgPath_ !== undefined ? pkgPath_ : ptrType$4.nil;
		this.typ = typ_ !== undefined ? typ_ : ptrType$1.nil;
	});
	interfaceType = $pkg.interfaceType = $newType(0, $kindStruct, "reflect.interfaceType", "interfaceType", "reflect", function(rtype_, methods_) {
		this.$val = this;
		this.rtype = rtype_ !== undefined ? rtype_ : new rtype.ptr();
		this.methods = methods_ !== undefined ? methods_ : sliceType$4.nil;
	});
	mapType = $pkg.mapType = $newType(0, $kindStruct, "reflect.mapType", "mapType", "reflect", function(rtype_, key_, elem_, bucket_, hmap_, keysize_, indirectkey_, valuesize_, indirectvalue_, bucketsize_) {
		this.$val = this;
		this.rtype = rtype_ !== undefined ? rtype_ : new rtype.ptr();
		this.key = key_ !== undefined ? key_ : ptrType$1.nil;
		this.elem = elem_ !== undefined ? elem_ : ptrType$1.nil;
		this.bucket = bucket_ !== undefined ? bucket_ : ptrType$1.nil;
		this.hmap = hmap_ !== undefined ? hmap_ : ptrType$1.nil;
		this.keysize = keysize_ !== undefined ? keysize_ : 0;
		this.indirectkey = indirectkey_ !== undefined ? indirectkey_ : 0;
		this.valuesize = valuesize_ !== undefined ? valuesize_ : 0;
		this.indirectvalue = indirectvalue_ !== undefined ? indirectvalue_ : 0;
		this.bucketsize = bucketsize_ !== undefined ? bucketsize_ : 0;
	});
	ptrType = $pkg.ptrType = $newType(0, $kindStruct, "reflect.ptrType", "ptrType", "reflect", function(rtype_, elem_) {
		this.$val = this;
		this.rtype = rtype_ !== undefined ? rtype_ : new rtype.ptr();
		this.elem = elem_ !== undefined ? elem_ : ptrType$1.nil;
	});
	sliceType = $pkg.sliceType = $newType(0, $kindStruct, "reflect.sliceType", "sliceType", "reflect", function(rtype_, elem_) {
		this.$val = this;
		this.rtype = rtype_ !== undefined ? rtype_ : new rtype.ptr();
		this.elem = elem_ !== undefined ? elem_ : ptrType$1.nil;
	});
	structField = $pkg.structField = $newType(0, $kindStruct, "reflect.structField", "structField", "reflect", function(name_, pkgPath_, typ_, tag_, offset_) {
		this.$val = this;
		this.name = name_ !== undefined ? name_ : ptrType$4.nil;
		this.pkgPath = pkgPath_ !== undefined ? pkgPath_ : ptrType$4.nil;
		this.typ = typ_ !== undefined ? typ_ : ptrType$1.nil;
		this.tag = tag_ !== undefined ? tag_ : ptrType$4.nil;
		this.offset = offset_ !== undefined ? offset_ : 0;
	});
	structType = $pkg.structType = $newType(0, $kindStruct, "reflect.structType", "structType", "reflect", function(rtype_, fields_) {
		this.$val = this;
		this.rtype = rtype_ !== undefined ? rtype_ : new rtype.ptr();
		this.fields = fields_ !== undefined ? fields_ : sliceType$5.nil;
	});
	Method = $pkg.Method = $newType(0, $kindStruct, "reflect.Method", "Method", "reflect", function(Name_, PkgPath_, Type_, Func_, Index_) {
		this.$val = this;
		this.Name = Name_ !== undefined ? Name_ : "";
		this.PkgPath = PkgPath_ !== undefined ? PkgPath_ : "";
		this.Type = Type_ !== undefined ? Type_ : $ifaceNil;
		this.Func = Func_ !== undefined ? Func_ : new Value.ptr();
		this.Index = Index_ !== undefined ? Index_ : 0;
	});
	StructField = $pkg.StructField = $newType(0, $kindStruct, "reflect.StructField", "StructField", "reflect", function(Name_, PkgPath_, Type_, Tag_, Offset_, Index_, Anonymous_) {
		this.$val = this;
		this.Name = Name_ !== undefined ? Name_ : "";
		this.PkgPath = PkgPath_ !== undefined ? PkgPath_ : "";
		this.Type = Type_ !== undefined ? Type_ : $ifaceNil;
		this.Tag = Tag_ !== undefined ? Tag_ : "";
		this.Offset = Offset_ !== undefined ? Offset_ : 0;
		this.Index = Index_ !== undefined ? Index_ : sliceType$9.nil;
		this.Anonymous = Anonymous_ !== undefined ? Anonymous_ : false;
	});
	StructTag = $pkg.StructTag = $newType(8, $kindString, "reflect.StructTag", "StructTag", "reflect", null);
	fieldScan = $pkg.fieldScan = $newType(0, $kindStruct, "reflect.fieldScan", "fieldScan", "reflect", function(typ_, index_) {
		this.$val = this;
		this.typ = typ_ !== undefined ? typ_ : ptrType$12.nil;
		this.index = index_ !== undefined ? index_ : sliceType$9.nil;
	});
	Value = $pkg.Value = $newType(0, $kindStruct, "reflect.Value", "Value", "reflect", function(typ_, ptr_, flag_) {
		this.$val = this;
		this.typ = typ_ !== undefined ? typ_ : ptrType$1.nil;
		this.ptr = ptr_ !== undefined ? ptr_ : 0;
		this.flag = flag_ !== undefined ? flag_ : 0;
	});
	flag = $pkg.flag = $newType(4, $kindUintptr, "reflect.flag", "flag", "reflect", null);
	ValueError = $pkg.ValueError = $newType(0, $kindStruct, "reflect.ValueError", "ValueError", "reflect", function(Method_, Kind_) {
		this.$val = this;
		this.Method = Method_ !== undefined ? Method_ : "";
		this.Kind = Kind_ !== undefined ? Kind_ : 0;
	});
	nonEmptyInterface = $pkg.nonEmptyInterface = $newType(0, $kindStruct, "reflect.nonEmptyInterface", "nonEmptyInterface", "reflect", function(itab_, word_) {
		this.$val = this;
		this.itab = itab_ !== undefined ? itab_ : ptrType$7.nil;
		this.word = word_ !== undefined ? word_ : 0;
	});
	ptrType$1 = $ptrType(rtype);
	sliceType$1 = $sliceType($String);
	ptrType$3 = $ptrType(typeAlg);
	arrayType$1 = $arrayType($UnsafePointer, 2);
	ptrType$4 = $ptrType($String);
	ptrType$5 = $ptrType(uncommonType);
	sliceType$2 = $sliceType(method);
	sliceType$3 = $sliceType(ptrType$1);
	sliceType$4 = $sliceType(imethod);
	sliceType$5 = $sliceType(structField);
	structType$5 = $structType([{prop: "str", name: "str", pkg: "reflect", typ: $String, tag: ""}]);
	sliceType$6 = $sliceType(Value);
	ptrType$6 = $ptrType(nonEmptyInterface);
	arrayType$2 = $arrayType($UnsafePointer, 100000);
	structType$6 = $structType([{prop: "ityp", name: "ityp", pkg: "reflect", typ: ptrType$1, tag: ""}, {prop: "typ", name: "typ", pkg: "reflect", typ: ptrType$1, tag: ""}, {prop: "link", name: "link", pkg: "reflect", typ: $UnsafePointer, tag: ""}, {prop: "bad", name: "bad", pkg: "reflect", typ: $Int32, tag: ""}, {prop: "unused", name: "unused", pkg: "reflect", typ: $Int32, tag: ""}, {prop: "fun", name: "fun", pkg: "reflect", typ: arrayType$2, tag: ""}]);
	ptrType$7 = $ptrType(structType$6);
	sliceType$7 = $sliceType(js.Object);
	ptrType$8 = $ptrType($Uint8);
	ptrType$9 = $ptrType(method);
	ptrType$10 = $ptrType(interfaceType);
	ptrType$11 = $ptrType(imethod);
	sliceType$9 = $sliceType($Int);
	sliceType$10 = $sliceType(fieldScan);
	ptrType$12 = $ptrType(structType);
	ptrType$17 = $ptrType($UnsafePointer);
	sliceType$12 = $sliceType($Uint8);
	sliceType$13 = $sliceType($Int32);
	funcType$2 = $funcType([$String], [$Bool], false);
	funcType$3 = $funcType([$UnsafePointer, $Uintptr, $Uintptr], [$Uintptr], false);
	funcType$4 = $funcType([$UnsafePointer, $UnsafePointer, $Uintptr], [$Bool], false);
	arrayType$3 = $arrayType($Uintptr, 2);
	ptrType$20 = $ptrType(ValueError);
	init = function() {
		var used, x, x$1, x$10, x$11, x$12, x$2, x$3, x$4, x$5, x$6, x$7, x$8, x$9;
		used = (function(i) {
			var i;
		});
		used((x = new rtype.ptr(0, 0, 0, 0, 0, 0, ptrType$3.nil, arrayType$1.zero(), ptrType$4.nil, ptrType$5.nil, ptrType$1.nil, 0), new x.constructor.elem(x)));
		used((x$1 = new uncommonType.ptr(ptrType$4.nil, ptrType$4.nil, sliceType$2.nil), new x$1.constructor.elem(x$1)));
		used((x$2 = new method.ptr(ptrType$4.nil, ptrType$4.nil, ptrType$1.nil, ptrType$1.nil, 0, 0), new x$2.constructor.elem(x$2)));
		used((x$3 = new arrayType.ptr(new rtype.ptr(), ptrType$1.nil, ptrType$1.nil, 0), new x$3.constructor.elem(x$3)));
		used((x$4 = new chanType.ptr(new rtype.ptr(), ptrType$1.nil, 0), new x$4.constructor.elem(x$4)));
		used((x$5 = new funcType.ptr(new rtype.ptr(), false, sliceType$3.nil, sliceType$3.nil), new x$5.constructor.elem(x$5)));
		used((x$6 = new interfaceType.ptr(new rtype.ptr(), sliceType$4.nil), new x$6.constructor.elem(x$6)));
		used((x$7 = new mapType.ptr(new rtype.ptr(), ptrType$1.nil, ptrType$1.nil, ptrType$1.nil, ptrType$1.nil, 0, 0, 0, 0, 0), new x$7.constructor.elem(x$7)));
		used((x$8 = new ptrType.ptr(new rtype.ptr(), ptrType$1.nil), new x$8.constructor.elem(x$8)));
		used((x$9 = new sliceType.ptr(new rtype.ptr(), ptrType$1.nil), new x$9.constructor.elem(x$9)));
		used((x$10 = new structType.ptr(new rtype.ptr(), sliceType$5.nil), new x$10.constructor.elem(x$10)));
		used((x$11 = new imethod.ptr(ptrType$4.nil, ptrType$4.nil, ptrType$1.nil), new x$11.constructor.elem(x$11)));
		used((x$12 = new structField.ptr(ptrType$4.nil, ptrType$4.nil, ptrType$1.nil, ptrType$4.nil, 0), new x$12.constructor.elem(x$12)));
		initialized = true;
		uint8Type = $assertType(TypeOf(new $Uint8(0)), ptrType$1);
	};
	jsType = function(typ) {
		var typ;
		return typ.jsType;
	};
	reflectType = function(typ) {
		var _i, _i$1, _i$2, _i$3, _i$4, _ref, _ref$1, _ref$2, _ref$3, _ref$4, _ref$5, dir, f, fields, i, i$1, i$2, i$3, i$4, imethods, in$1, m, m$1, methodSet, methods, out, params, reflectFields, reflectMethods, results, rt, t, typ;
		if (typ.reflectType === undefined) {
			rt = new rtype.ptr((($parseInt(typ.size) >> 0) >>> 0), 0, 0, 0, 0, (($parseInt(typ.kind) >> 0) << 24 >>> 24), ptrType$3.nil, arrayType$1.zero(), newStringPtr(typ.string), ptrType$5.nil, ptrType$1.nil, 0);
			rt.jsType = typ;
			typ.reflectType = rt;
			methodSet = $methodSet(typ);
			if (!($internalize(typ.typeName, $String) === "") || !(($parseInt(methodSet.length) === 0))) {
				reflectMethods = $makeSlice(sliceType$2, $parseInt(methodSet.length));
				_ref = reflectMethods;
				_i = 0;
				while (true) {
					if (!(_i < _ref.$length)) { break; }
					i = _i;
					m = methodSet[i];
					t = m.typ;
					$copy(((i < 0 || i >= reflectMethods.$length) ? $throwRuntimeError("index out of range") : reflectMethods.$array[reflectMethods.$offset + i]), new method.ptr(newStringPtr(m.name), newStringPtr(m.pkg), reflectType(t), reflectType($funcType(new ($global.Array)(typ).concat(t.params), t.results, t.variadic)), 0, 0), method);
					_i++;
				}
				rt.uncommonType = new uncommonType.ptr(newStringPtr(typ.typeName), newStringPtr(typ.pkg), reflectMethods);
				rt.uncommonType.jsType = typ;
			}
			_ref$1 = rt.Kind();
			if (_ref$1 === 17) {
				setKindType(rt, new arrayType.ptr(new rtype.ptr(), reflectType(typ.elem), ptrType$1.nil, (($parseInt(typ.len) >> 0) >>> 0)));
			} else if (_ref$1 === 18) {
				dir = 3;
				if (!!(typ.sendOnly)) {
					dir = 2;
				}
				if (!!(typ.recvOnly)) {
					dir = 1;
				}
				setKindType(rt, new chanType.ptr(new rtype.ptr(), reflectType(typ.elem), (dir >>> 0)));
			} else if (_ref$1 === 19) {
				params = typ.params;
				in$1 = $makeSlice(sliceType$3, $parseInt(params.length));
				_ref$2 = in$1;
				_i$1 = 0;
				while (true) {
					if (!(_i$1 < _ref$2.$length)) { break; }
					i$1 = _i$1;
					(i$1 < 0 || i$1 >= in$1.$length) ? $throwRuntimeError("index out of range") : in$1.$array[in$1.$offset + i$1] = reflectType(params[i$1]);
					_i$1++;
				}
				results = typ.results;
				out = $makeSlice(sliceType$3, $parseInt(results.length));
				_ref$3 = out;
				_i$2 = 0;
				while (true) {
					if (!(_i$2 < _ref$3.$length)) { break; }
					i$2 = _i$2;
					(i$2 < 0 || i$2 >= out.$length) ? $throwRuntimeError("index out of range") : out.$array[out.$offset + i$2] = reflectType(results[i$2]);
					_i$2++;
				}
				setKindType(rt, new funcType.ptr($clone(rt, rtype), !!(typ.variadic), in$1, out));
			} else if (_ref$1 === 20) {
				methods = typ.methods;
				imethods = $makeSlice(sliceType$4, $parseInt(methods.length));
				_ref$4 = imethods;
				_i$3 = 0;
				while (true) {
					if (!(_i$3 < _ref$4.$length)) { break; }
					i$3 = _i$3;
					m$1 = methods[i$3];
					$copy(((i$3 < 0 || i$3 >= imethods.$length) ? $throwRuntimeError("index out of range") : imethods.$array[imethods.$offset + i$3]), new imethod.ptr(newStringPtr(m$1.name), newStringPtr(m$1.pkg), reflectType(m$1.typ)), imethod);
					_i$3++;
				}
				setKindType(rt, new interfaceType.ptr($clone(rt, rtype), imethods));
			} else if (_ref$1 === 21) {
				setKindType(rt, new mapType.ptr(new rtype.ptr(), reflectType(typ.key), reflectType(typ.elem), ptrType$1.nil, ptrType$1.nil, 0, 0, 0, 0, 0));
			} else if (_ref$1 === 22) {
				setKindType(rt, new ptrType.ptr(new rtype.ptr(), reflectType(typ.elem)));
			} else if (_ref$1 === 23) {
				setKindType(rt, new sliceType.ptr(new rtype.ptr(), reflectType(typ.elem)));
			} else if (_ref$1 === 25) {
				fields = typ.fields;
				reflectFields = $makeSlice(sliceType$5, $parseInt(fields.length));
				_ref$5 = reflectFields;
				_i$4 = 0;
				while (true) {
					if (!(_i$4 < _ref$5.$length)) { break; }
					i$4 = _i$4;
					f = fields[i$4];
					$copy(((i$4 < 0 || i$4 >= reflectFields.$length) ? $throwRuntimeError("index out of range") : reflectFields.$array[reflectFields.$offset + i$4]), new structField.ptr(newStringPtr(f.name), newStringPtr(f.pkg), reflectType(f.typ), newStringPtr(f.tag), (i$4 >>> 0)), structField);
					_i$4++;
				}
				setKindType(rt, new structType.ptr($clone(rt, rtype), reflectFields));
			}
		}
		return typ.reflectType;
	};
	setKindType = function(rt, kindType) {
		var kindType, rt;
		rt.kindType = kindType;
		kindType.rtype = rt;
	};
	newStringPtr = function(strObj) {
		var _entry, _key, _tuple, c, ok, ptr, str, strObj;
		c = $clone(new structType$5.ptr(), structType$5);
		c.str = strObj;
		str = c.str;
		if (str === "") {
			return ptrType$4.nil;
		}
		_tuple = (_entry = stringPtrMap[str], _entry !== undefined ? [_entry.v, true] : [ptrType$4.nil, false]); ptr = _tuple[0]; ok = _tuple[1];
		if (!ok) {
			ptr = new ptrType$4(function() { return str; }, function($v) { str = $v; });
			_key = str; (stringPtrMap || $throwRuntimeError("assignment to entry in nil map"))[_key] = { k: _key, v: ptr };
		}
		return ptr;
	};
	isWrapped = function(typ) {
		var _ref, typ;
		_ref = typ.Kind();
		if (_ref === 1 || _ref === 2 || _ref === 3 || _ref === 4 || _ref === 5 || _ref === 7 || _ref === 8 || _ref === 9 || _ref === 10 || _ref === 12 || _ref === 13 || _ref === 14 || _ref === 17 || _ref === 21 || _ref === 19 || _ref === 24 || _ref === 25) {
			return true;
		} else if (_ref === 22) {
			return typ.Elem().Kind() === 17;
		}
		return false;
	};
	copyStruct = function(dst, src, typ) {
		var dst, fields, i, prop, src, typ;
		fields = jsType(typ).fields;
		i = 0;
		while (true) {
			if (!(i < $parseInt(fields.length))) { break; }
			prop = $internalize(fields[i].prop, $String);
			dst[$externalize(prop, $String)] = src[$externalize(prop, $String)];
			i = i + (1) >> 0;
		}
	};
	makeValue = function(t, v, fl) {
		var fl, rt, t, v;
		rt = t.common();
		if ((t.Kind() === 17) || (t.Kind() === 25) || (t.Kind() === 22)) {
			return new Value.ptr(rt, v, (fl | (t.Kind() >>> 0)) >>> 0);
		}
		return new Value.ptr(rt, $newDataPointer(v, jsType(rt.ptrTo())), (((fl | (t.Kind() >>> 0)) >>> 0) | 64) >>> 0);
	};
	MakeSlice = $pkg.MakeSlice = function(typ, len, cap) {
		var cap, len, typ;
		if (!((typ.Kind() === 23))) {
			$panic(new $String("reflect.MakeSlice of non-slice type"));
		}
		if (len < 0) {
			$panic(new $String("reflect.MakeSlice: negative len"));
		}
		if (cap < 0) {
			$panic(new $String("reflect.MakeSlice: negative cap"));
		}
		if (len > cap) {
			$panic(new $String("reflect.MakeSlice: len > cap"));
		}
		return makeValue(typ, $makeSlice(jsType(typ), len, cap, (function() {
			return jsType(typ.Elem()).zero();
		})), 0);
	};
	TypeOf = $pkg.TypeOf = function(i) {
		var i;
		if (!initialized) {
			return new rtype.ptr(0, 0, 0, 0, 0, 0, ptrType$3.nil, arrayType$1.zero(), ptrType$4.nil, ptrType$5.nil, ptrType$1.nil, 0);
		}
		if ($interfaceIsEqual(i, $ifaceNil)) {
			return $ifaceNil;
		}
		return reflectType(i.constructor);
	};
	ValueOf = $pkg.ValueOf = function(i) {
		var i;
		if ($interfaceIsEqual(i, $ifaceNil)) {
			return new Value.ptr(ptrType$1.nil, 0, 0);
		}
		return makeValue(reflectType(i.constructor), i.$val, 0);
	};
	rtype.ptr.prototype.ptrTo = function() {
		var t;
		t = this;
		return reflectType($ptrType(jsType(t)));
	};
	rtype.prototype.ptrTo = function() { return this.$val.ptrTo(); };
	SliceOf = $pkg.SliceOf = function(t) {
		var t;
		return reflectType($sliceType(jsType(t)));
	};
	Zero = $pkg.Zero = function(typ) {
		var typ;
		return makeValue(typ, jsType(typ).zero(), 0);
	};
	unsafe_New = function(typ) {
		var _ref, typ;
		_ref = typ.Kind();
		if (_ref === 25) {
			return new (jsType(typ).ptr)();
		} else if (_ref === 17) {
			return jsType(typ).zero();
		} else {
			return $newDataPointer(jsType(typ).zero(), jsType(typ.ptrTo()));
		}
	};
	makeInt = function(f, bits, t) {
		var _ref, bits, f, ptr, t, typ;
		typ = t.common();
		ptr = unsafe_New(typ);
		_ref = typ.Kind();
		if (_ref === 3) {
			ptr.$set((bits.$low << 24 >> 24));
		} else if (_ref === 4) {
			ptr.$set((bits.$low << 16 >> 16));
		} else if (_ref === 2 || _ref === 5) {
			ptr.$set((bits.$low >> 0));
		} else if (_ref === 6) {
			ptr.$set(new $Int64(bits.$high, bits.$low));
		} else if (_ref === 8) {
			ptr.$set((bits.$low << 24 >>> 24));
		} else if (_ref === 9) {
			ptr.$set((bits.$low << 16 >>> 16));
		} else if (_ref === 7 || _ref === 10 || _ref === 12) {
			ptr.$set((bits.$low >>> 0));
		} else if (_ref === 11) {
			ptr.$set(bits);
		}
		return new Value.ptr(typ, ptr, (((f | 64) >>> 0) | (typ.Kind() >>> 0)) >>> 0);
	};
	memmove = function(adst, asrc, n) {
		var adst, asrc, n;
		adst.$set(asrc.$get());
	};
	mapaccess = function(t, m, key) {
		var entry, k, key, m, t;
		k = key.$get();
		if (!(k.$key === undefined)) {
			k = k.$key();
		}
		entry = m[$externalize($internalize(k, $String), $String)];
		if (entry === undefined) {
			return 0;
		}
		return $newDataPointer(entry.v, jsType(PtrTo(t.Elem())));
	};
	mapassign = function(t, m, key, val) {
		var entry, et, jsVal, k, key, kv, m, newVal, t, val;
		kv = key.$get();
		k = kv;
		if (!(k.$key === undefined)) {
			k = k.$key();
		}
		jsVal = val.$get();
		et = t.Elem();
		if (et.Kind() === 25) {
			newVal = jsType(et).zero();
			copyStruct(newVal, jsVal, et);
			jsVal = newVal;
		}
		entry = new ($global.Object)();
		entry.k = kv;
		entry.v = jsVal;
		m[$externalize($internalize(k, $String), $String)] = entry;
	};
	mapdelete = function(t, m, key) {
		var k, key, m, t;
		k = key.$get();
		if (!(k.$key === undefined)) {
			k = k.$key();
		}
		delete m[$externalize($internalize(k, $String), $String)];
	};
	mapiterinit = function(t, m) {
		var m, t;
		return new mapIter.ptr(t, m, $keys(m), 0);
	};
	mapiterkey = function(it) {
		var it, iter, k;
		iter = it;
		k = iter.keys[iter.i];
		return $newDataPointer(iter.m[$externalize($internalize(k, $String), $String)].k, jsType(PtrTo(iter.t.Key())));
	};
	mapiternext = function(it) {
		var it, iter;
		iter = it;
		iter.i = iter.i + (1) >> 0;
	};
	maplen = function(m) {
		var m;
		return $parseInt($keys(m).length);
	};
	cvtDirect = function(v, typ) {
		var _ref, k, slice, srcVal, typ, v, val;
		v = v;
		srcVal = v.object();
		if (srcVal === jsType(v.typ).nil) {
			return makeValue(typ, jsType(typ).nil, v.flag);
		}
		val = null;
		k = typ.Kind();
		_ref = k;
		switch (0) { default: if (_ref === 18) {
			val = new (jsType(typ))();
		} else if (_ref === 23) {
			slice = new (jsType(typ))(srcVal.$array);
			slice.$offset = srcVal.$offset;
			slice.$length = srcVal.$length;
			slice.$capacity = srcVal.$capacity;
			val = $newDataPointer(slice, jsType(PtrTo(typ)));
		} else if (_ref === 22) {
			if (typ.Elem().Kind() === 25) {
				if ($interfaceIsEqual(typ.Elem(), v.typ.Elem())) {
					val = srcVal;
					break;
				}
				val = new (jsType(typ))();
				copyStruct(val, srcVal, typ.Elem());
				break;
			}
			val = new (jsType(typ))(srcVal.$get, srcVal.$set);
		} else if (_ref === 25) {
			val = new (jsType(typ).ptr)();
			copyStruct(val, srcVal, typ);
		} else if (_ref === 17 || _ref === 19 || _ref === 20 || _ref === 21 || _ref === 24) {
			val = v.ptr;
		} else {
			$panic(new ValueError.ptr("reflect.Convert", k));
		} }
		return new Value.ptr(typ.common(), val, (((v.flag & 96) >>> 0) | (typ.Kind() >>> 0)) >>> 0);
	};
	methodReceiver = function(op, v, i) {
		var fn = 0, i, iface, m, m$1, op, prop, rcvr, rcvrtype = ptrType$1.nil, t = ptrType$1.nil, tt, ut, v, x, x$1;
		v = v;
		prop = "";
		if (v.typ.Kind() === 20) {
			tt = v.typ.kindType;
			if (i < 0 || i >= tt.methods.$length) {
				$panic(new $String("reflect: internal error: invalid method index"));
			}
			m = (x = tt.methods, ((i < 0 || i >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + i]));
			if (!($pointerIsEqual(m.pkgPath, ptrType$4.nil))) {
				$panic(new $String("reflect: " + op + " of unexported method"));
			}
			iface = $pointerOfStructConversion(v.ptr, ptrType$6);
			if (iface.itab === ptrType$7.nil) {
				$panic(new $String("reflect: " + op + " of method on nil interface value"));
			}
			t = m.typ;
			prop = m.name.$get();
		} else {
			ut = v.typ.uncommonType.uncommon();
			if (ut === ptrType$5.nil || i < 0 || i >= ut.methods.$length) {
				$panic(new $String("reflect: internal error: invalid method index"));
			}
			m$1 = (x$1 = ut.methods, ((i < 0 || i >= x$1.$length) ? $throwRuntimeError("index out of range") : x$1.$array[x$1.$offset + i]));
			if (!($pointerIsEqual(m$1.pkgPath, ptrType$4.nil))) {
				$panic(new $String("reflect: " + op + " of unexported method"));
			}
			t = m$1.mtyp;
			prop = $internalize($methodSet(jsType(v.typ))[i].prop, $String);
		}
		rcvr = v.object();
		if (isWrapped(v.typ)) {
			rcvr = new (jsType(v.typ))(rcvr);
		}
		fn = rcvr[$externalize(prop, $String)];
		return [rcvrtype, t, fn];
	};
	valueInterface = function(v, safe) {
		var safe, v;
		v = v;
		if (v.flag === 0) {
			$panic(new ValueError.ptr("reflect.Value.Interface", 0));
		}
		if (safe && !((((v.flag & 32) >>> 0) === 0))) {
			$panic(new $String("reflect.Value.Interface: cannot return value obtained from unexported field or method"));
		}
		if (!((((v.flag & 256) >>> 0) === 0))) {
			v = makeMethodValue("Interface", v);
		}
		if (isWrapped(v.typ)) {
			return new (jsType(v.typ))(v.object());
		}
		return v.object();
	};
	ifaceE2I = function(t, src, dst) {
		var dst, src, t;
		dst.$set(src);
	};
	methodName = function() {
		return "?FIXME?";
	};
	makeMethodValue = function(op, v) {
		var _tuple, fn, fv, op, rcvr, v;
		v = v;
		if (((v.flag & 256) >>> 0) === 0) {
			$panic(new $String("reflect: internal error: invalid use of makePartialFunc"));
		}
		_tuple = methodReceiver(op, v, (v.flag >> 0) >> 9 >> 0); fn = _tuple[2];
		rcvr = v.object();
		if (isWrapped(v.typ)) {
			rcvr = new (jsType(v.typ))(rcvr);
		}
		fv = (function() {
			return fn.apply(rcvr, $externalize(new ($sliceType(js.Object))($global.Array.prototype.slice.call(arguments, [])), sliceType$7));
		});
		return new Value.ptr(v.Type().common(), fv, (((v.flag & 32) >>> 0) | 19) >>> 0);
	};
	rtype.ptr.prototype.pointers = function() {
		var _ref, t;
		t = this;
		_ref = t.Kind();
		if (_ref === 22 || _ref === 21 || _ref === 18 || _ref === 19 || _ref === 25 || _ref === 17) {
			return true;
		} else {
			return false;
		}
	};
	rtype.prototype.pointers = function() { return this.$val.pointers(); };
	rtype.ptr.prototype.Comparable = function() {
		var _ref, i, t;
		t = this;
		_ref = t.Kind();
		if (_ref === 19 || _ref === 23 || _ref === 21) {
			return false;
		} else if (_ref === 17) {
			return t.Elem().Comparable();
		} else if (_ref === 25) {
			i = 0;
			while (true) {
				if (!(i < t.NumField())) { break; }
				if (!t.Field(i).Type.Comparable()) {
					return false;
				}
				i = i + (1) >> 0;
			}
		}
		return true;
	};
	rtype.prototype.Comparable = function() { return this.$val.Comparable(); };
	uncommonType.ptr.prototype.Method = function(i) {
		var fl, fn, i, m = new Method.ptr(), mt, p, prop, t, x;
		t = this;
		if (t === ptrType$5.nil || i < 0 || i >= t.methods.$length) {
			$panic(new $String("reflect: Method index out of range"));
		}
		p = (x = t.methods, ((i < 0 || i >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + i]));
		if (!($pointerIsEqual(p.name, ptrType$4.nil))) {
			m.Name = p.name.$get();
		}
		fl = 19;
		if (!($pointerIsEqual(p.pkgPath, ptrType$4.nil))) {
			m.PkgPath = p.pkgPath.$get();
			fl = (fl | (32)) >>> 0;
		}
		mt = p.typ;
		m.Type = mt;
		prop = $internalize($methodSet(t.jsType)[i].prop, $String);
		fn = (function(rcvr) {
			var rcvr;
			return rcvr[$externalize(prop, $String)].apply(rcvr, $externalize($subslice(new ($sliceType(js.Object))($global.Array.prototype.slice.call(arguments, [])), 1), sliceType$7));
		});
		m.Func = new Value.ptr(mt, fn, fl);
		m.Index = i;
		return m;
	};
	uncommonType.prototype.Method = function(i) { return this.$val.Method(i); };
	Value.ptr.prototype.object = function() {
		var _ref, newVal, v, val;
		v = this;
		if ((v.typ.Kind() === 17) || (v.typ.Kind() === 25)) {
			return v.ptr;
		}
		if (!((((v.flag & 64) >>> 0) === 0))) {
			val = v.ptr.$get();
			if (!(val === $ifaceNil) && !(val.constructor === jsType(v.typ))) {
				_ref = v.typ.Kind();
				switch (0) { default: if (_ref === 11 || _ref === 6) {
					val = new (jsType(v.typ))(val.$high, val.$low);
				} else if (_ref === 15 || _ref === 16) {
					val = new (jsType(v.typ))(val.$real, val.$imag);
				} else if (_ref === 23) {
					if (val === val.constructor.nil) {
						val = jsType(v.typ).nil;
						break;
					}
					newVal = new (jsType(v.typ))(val.$array);
					newVal.$offset = val.$offset;
					newVal.$length = val.$length;
					newVal.$capacity = val.$capacity;
					val = newVal;
				} }
			}
			return val;
		}
		return v.ptr;
	};
	Value.prototype.object = function() { return this.$val.object(); };
	Value.ptr.prototype.call = function(op, in$1) {
		var _i, _i$1, _i$2, _ref, _ref$1, _ref$2, _ref$3, _tmp, _tmp$1, _tuple, arg, argsArray, elem, fn, i, i$1, i$2, i$3, in$1, isSlice, m, n, nin, nout, op, origIn, rcvr, results, ret, slice, t, targ, v, x, x$1, x$2, xt, xt$1;
		v = this;
		t = v.typ;
		fn = 0;
		rcvr = null;
		if (!((((v.flag & 256) >>> 0) === 0))) {
			_tuple = methodReceiver(op, v, (v.flag >> 0) >> 9 >> 0); t = _tuple[1]; fn = _tuple[2];
			rcvr = v.object();
			if (isWrapped(v.typ)) {
				rcvr = new (jsType(v.typ))(rcvr);
			}
		} else {
			fn = v.object();
		}
		if (fn === 0) {
			$panic(new $String("reflect.Value.Call: call of nil function"));
		}
		isSlice = op === "CallSlice";
		n = t.NumIn();
		if (isSlice) {
			if (!t.IsVariadic()) {
				$panic(new $String("reflect: CallSlice of non-variadic function"));
			}
			if (in$1.$length < n) {
				$panic(new $String("reflect: CallSlice with too few input arguments"));
			}
			if (in$1.$length > n) {
				$panic(new $String("reflect: CallSlice with too many input arguments"));
			}
		} else {
			if (t.IsVariadic()) {
				n = n - (1) >> 0;
			}
			if (in$1.$length < n) {
				$panic(new $String("reflect: Call with too few input arguments"));
			}
			if (!t.IsVariadic() && in$1.$length > n) {
				$panic(new $String("reflect: Call with too many input arguments"));
			}
		}
		_ref = in$1;
		_i = 0;
		while (true) {
			if (!(_i < _ref.$length)) { break; }
			x = ((_i < 0 || _i >= _ref.$length) ? $throwRuntimeError("index out of range") : _ref.$array[_ref.$offset + _i]);
			if (x.Kind() === 0) {
				$panic(new $String("reflect: " + op + " using zero Value argument"));
			}
			_i++;
		}
		i = 0;
		while (true) {
			if (!(i < n)) { break; }
			_tmp = ((i < 0 || i >= in$1.$length) ? $throwRuntimeError("index out of range") : in$1.$array[in$1.$offset + i]).Type(); _tmp$1 = t.In(i); xt = _tmp; targ = _tmp$1;
			if (!xt.AssignableTo(targ)) {
				$panic(new $String("reflect: " + op + " using " + xt.String() + " as type " + targ.String()));
			}
			i = i + (1) >> 0;
		}
		if (!isSlice && t.IsVariadic()) {
			m = in$1.$length - n >> 0;
			slice = MakeSlice(t.In(n), m, m);
			elem = t.In(n).Elem();
			i$1 = 0;
			while (true) {
				if (!(i$1 < m)) { break; }
				x$2 = (x$1 = n + i$1 >> 0, ((x$1 < 0 || x$1 >= in$1.$length) ? $throwRuntimeError("index out of range") : in$1.$array[in$1.$offset + x$1]));
				xt$1 = x$2.Type();
				if (!xt$1.AssignableTo(elem)) {
					$panic(new $String("reflect: cannot use " + xt$1.String() + " as type " + elem.String() + " in " + op));
				}
				slice.Index(i$1).Set(x$2);
				i$1 = i$1 + (1) >> 0;
			}
			origIn = in$1;
			in$1 = $makeSlice(sliceType$6, (n + 1 >> 0));
			$copySlice($subslice(in$1, 0, n), origIn);
			(n < 0 || n >= in$1.$length) ? $throwRuntimeError("index out of range") : in$1.$array[in$1.$offset + n] = slice;
		}
		nin = in$1.$length;
		if (!((nin === t.NumIn()))) {
			$panic(new $String("reflect.Value.Call: wrong argument count"));
		}
		nout = t.NumOut();
		argsArray = new ($global.Array)(t.NumIn());
		_ref$1 = in$1;
		_i$1 = 0;
		while (true) {
			if (!(_i$1 < _ref$1.$length)) { break; }
			i$2 = _i$1;
			arg = ((_i$1 < 0 || _i$1 >= _ref$1.$length) ? $throwRuntimeError("index out of range") : _ref$1.$array[_ref$1.$offset + _i$1]);
			argsArray[i$2] = unwrapJsObject(t.In(i$2), arg.assignTo("reflect.Value.Call", t.In(i$2).common(), 0).object());
			_i$1++;
		}
		results = fn.apply(rcvr, argsArray);
		_ref$2 = nout;
		if (_ref$2 === 0) {
			return sliceType$6.nil;
		} else if (_ref$2 === 1) {
			return new sliceType$6([$clone(makeValue(t.Out(0), wrapJsObject(t.Out(0), results), 0), Value)]);
		} else {
			ret = $makeSlice(sliceType$6, nout);
			_ref$3 = ret;
			_i$2 = 0;
			while (true) {
				if (!(_i$2 < _ref$3.$length)) { break; }
				i$3 = _i$2;
				(i$3 < 0 || i$3 >= ret.$length) ? $throwRuntimeError("index out of range") : ret.$array[ret.$offset + i$3] = makeValue(t.Out(i$3), wrapJsObject(t.Out(i$3), results[i$3]), 0);
				_i$2++;
			}
			return ret;
		}
	};
	Value.prototype.call = function(op, in$1) { return this.$val.call(op, in$1); };
	Value.ptr.prototype.Cap = function() {
		var _ref, k, v;
		v = this;
		k = new flag(v.flag).kind();
		_ref = k;
		if (_ref === 17) {
			return v.typ.Len();
		} else if (_ref === 18 || _ref === 23) {
			return $parseInt(v.object().$capacity) >> 0;
		}
		$panic(new ValueError.ptr("reflect.Value.Cap", k));
	};
	Value.prototype.Cap = function() { return this.$val.Cap(); };
	wrapJsObject = function(typ, val) {
		var typ, val;
		if ($interfaceIsEqual(typ, reflectType(jsObject))) {
			return new (jsContainer)(val);
		}
		return val;
	};
	unwrapJsObject = function(typ, val) {
		var typ, val;
		if ($interfaceIsEqual(typ, reflectType(jsObject))) {
			return val.Object;
		}
		return val;
	};
	Value.ptr.prototype.Elem = function() {
		var _ref, fl, k, tt, typ, v, val, val$1;
		v = this;
		k = new flag(v.flag).kind();
		_ref = k;
		if (_ref === 20) {
			val = v.object();
			if (val === $ifaceNil) {
				return new Value.ptr(ptrType$1.nil, 0, 0);
			}
			typ = reflectType(val.constructor);
			return makeValue(typ, val.$val, (v.flag & 32) >>> 0);
		} else if (_ref === 22) {
			if (v.IsNil()) {
				return new Value.ptr(ptrType$1.nil, 0, 0);
			}
			val$1 = v.object();
			tt = v.typ.kindType;
			fl = (((((v.flag & 32) >>> 0) | 64) >>> 0) | 128) >>> 0;
			fl = (fl | ((tt.elem.Kind() >>> 0))) >>> 0;
			return new Value.ptr(tt.elem, wrapJsObject(tt.elem, val$1), fl);
		} else {
			$panic(new ValueError.ptr("reflect.Value.Elem", k));
		}
	};
	Value.prototype.Elem = function() { return this.$val.Elem(); };
	Value.ptr.prototype.Field = function(i) {
		var field, fl, i, prop, s, tt, typ, v, x;
		v = this;
		new flag(v.flag).mustBe(25);
		tt = v.typ.kindType;
		if (i < 0 || i >= tt.fields.$length) {
			$panic(new $String("reflect: Field index out of range"));
		}
		field = (x = tt.fields, ((i < 0 || i >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + i]));
		prop = $internalize(jsType(v.typ).fields[i].prop, $String);
		typ = field.typ;
		fl = (v.flag & 224) >>> 0;
		if (!($pointerIsEqual(field.pkgPath, ptrType$4.nil))) {
			fl = (fl | (32)) >>> 0;
		}
		fl = (fl | ((typ.Kind() >>> 0))) >>> 0;
		s = v.ptr;
		if (!((((fl & 64) >>> 0) === 0)) && !((typ.Kind() === 17)) && !((typ.Kind() === 25))) {
			return new Value.ptr(typ, new (jsType(PtrTo(typ)))((function() {
				return wrapJsObject(typ, s[$externalize(prop, $String)]);
			}), (function(v$1) {
				var v$1;
				s[$externalize(prop, $String)] = unwrapJsObject(typ, v$1);
			})), fl);
		}
		return makeValue(typ, wrapJsObject(typ, s[$externalize(prop, $String)]), fl);
	};
	Value.prototype.Field = function(i) { return this.$val.Field(i); };
	Value.ptr.prototype.Index = function(i) {
		var _ref, a, a$1, c, fl, fl$1, fl$2, i, k, s, str, tt, tt$1, typ, typ$1, v;
		v = this;
		k = new flag(v.flag).kind();
		_ref = k;
		if (_ref === 17) {
			tt = v.typ.kindType;
			if (i < 0 || i > (tt.len >> 0)) {
				$panic(new $String("reflect: array index out of range"));
			}
			typ = tt.elem;
			fl = (v.flag & 224) >>> 0;
			fl = (fl | ((typ.Kind() >>> 0))) >>> 0;
			a = v.ptr;
			if (!((((fl & 64) >>> 0) === 0)) && !((typ.Kind() === 17)) && !((typ.Kind() === 25))) {
				return new Value.ptr(typ, new (jsType(PtrTo(typ)))((function() {
					return wrapJsObject(typ, a[i]);
				}), (function(v$1) {
					var v$1;
					a[i] = unwrapJsObject(typ, v$1);
				})), fl);
			}
			return makeValue(typ, wrapJsObject(typ, a[i]), fl);
		} else if (_ref === 23) {
			s = v.object();
			if (i < 0 || i >= ($parseInt(s.$length) >> 0)) {
				$panic(new $String("reflect: slice index out of range"));
			}
			tt$1 = v.typ.kindType;
			typ$1 = tt$1.elem;
			fl$1 = (192 | ((v.flag & 32) >>> 0)) >>> 0;
			fl$1 = (fl$1 | ((typ$1.Kind() >>> 0))) >>> 0;
			i = i + (($parseInt(s.$offset) >> 0)) >> 0;
			a$1 = s.$array;
			if (!((((fl$1 & 64) >>> 0) === 0)) && !((typ$1.Kind() === 17)) && !((typ$1.Kind() === 25))) {
				return new Value.ptr(typ$1, new (jsType(PtrTo(typ$1)))((function() {
					return wrapJsObject(typ$1, a$1[i]);
				}), (function(v$1) {
					var v$1;
					a$1[i] = unwrapJsObject(typ$1, v$1);
				})), fl$1);
			}
			return makeValue(typ$1, wrapJsObject(typ$1, a$1[i]), fl$1);
		} else if (_ref === 24) {
			str = v.ptr.$get();
			if (i < 0 || i >= str.length) {
				$panic(new $String("reflect: string index out of range"));
			}
			fl$2 = (((v.flag & 32) >>> 0) | 8) >>> 0;
			c = str.charCodeAt(i);
			return new Value.ptr(uint8Type, new ptrType$8(function() { return c; }, function($v) { c = $v; }), (fl$2 | 64) >>> 0);
		} else {
			$panic(new ValueError.ptr("reflect.Value.Index", k));
		}
	};
	Value.prototype.Index = function(i) { return this.$val.Index(i); };
	Value.ptr.prototype.IsNil = function() {
		var _ref, k, v;
		v = this;
		k = new flag(v.flag).kind();
		_ref = k;
		if (_ref === 18 || _ref === 22 || _ref === 23) {
			return v.object() === jsType(v.typ).nil;
		} else if (_ref === 19) {
			return v.object() === $throwNilPointerError;
		} else if (_ref === 21) {
			return v.object() === false;
		} else if (_ref === 20) {
			return v.object() === $ifaceNil;
		} else {
			$panic(new ValueError.ptr("reflect.Value.IsNil", k));
		}
	};
	Value.prototype.IsNil = function() { return this.$val.IsNil(); };
	Value.ptr.prototype.Len = function() {
		var _ref, k, v;
		v = this;
		k = new flag(v.flag).kind();
		_ref = k;
		if (_ref === 17 || _ref === 24) {
			return $parseInt(v.object().length);
		} else if (_ref === 23) {
			return $parseInt(v.object().$length) >> 0;
		} else if (_ref === 18) {
			return $parseInt(v.object().$buffer.length) >> 0;
		} else if (_ref === 21) {
			return $parseInt($keys(v.object()).length);
		} else {
			$panic(new ValueError.ptr("reflect.Value.Len", k));
		}
	};
	Value.prototype.Len = function() { return this.$val.Len(); };
	Value.ptr.prototype.Pointer = function() {
		var _ref, k, v;
		v = this;
		k = new flag(v.flag).kind();
		_ref = k;
		if (_ref === 18 || _ref === 21 || _ref === 22 || _ref === 26) {
			if (v.IsNil()) {
				return 0;
			}
			return v.object();
		} else if (_ref === 19) {
			if (v.IsNil()) {
				return 0;
			}
			return 1;
		} else if (_ref === 23) {
			if (v.IsNil()) {
				return 0;
			}
			return v.object().$array;
		} else {
			$panic(new ValueError.ptr("reflect.Value.Pointer", k));
		}
	};
	Value.prototype.Pointer = function() { return this.$val.Pointer(); };
	Value.ptr.prototype.Set = function(x) {
		var _ref, v, x;
		v = this;
		x = x;
		new flag(v.flag).mustBeAssignable();
		new flag(x.flag).mustBeExported();
		x = x.assignTo("reflect.Set", v.typ, 0);
		if (!((((v.flag & 64) >>> 0) === 0))) {
			_ref = v.typ.Kind();
			if (_ref === 17) {
				$copy(v.ptr, x.ptr, jsType(v.typ));
			} else if (_ref === 20) {
				v.ptr.$set(valueInterface(x, false));
			} else if (_ref === 25) {
				copyStruct(v.ptr, x.ptr, v.typ);
			} else {
				v.ptr.$set(x.object());
			}
			return;
		}
		v.ptr = x.ptr;
	};
	Value.prototype.Set = function(x) { return this.$val.Set(x); };
	Value.ptr.prototype.SetCap = function(n) {
		var n, newSlice, s, v;
		v = this;
		new flag(v.flag).mustBeAssignable();
		new flag(v.flag).mustBe(23);
		s = v.ptr.$get();
		if (n < ($parseInt(s.$length) >> 0) || n > ($parseInt(s.$capacity) >> 0)) {
			$panic(new $String("reflect: slice capacity out of range in SetCap"));
		}
		newSlice = new (jsType(v.typ))(s.$array);
		newSlice.$offset = s.$offset;
		newSlice.$length = s.$length;
		newSlice.$capacity = n;
		v.ptr.$set(newSlice);
	};
	Value.prototype.SetCap = function(n) { return this.$val.SetCap(n); };
	Value.ptr.prototype.SetLen = function(n) {
		var n, newSlice, s, v;
		v = this;
		new flag(v.flag).mustBeAssignable();
		new flag(v.flag).mustBe(23);
		s = v.ptr.$get();
		if (n < 0 || n > ($parseInt(s.$capacity) >> 0)) {
			$panic(new $String("reflect: slice length out of range in SetLen"));
		}
		newSlice = new (jsType(v.typ))(s.$array);
		newSlice.$offset = s.$offset;
		newSlice.$length = n;
		newSlice.$capacity = s.$capacity;
		v.ptr.$set(newSlice);
	};
	Value.prototype.SetLen = function(n) { return this.$val.SetLen(n); };
	Value.ptr.prototype.Slice = function(i, j) {
		var _ref, cap, i, j, kind, s, str, tt, typ, v;
		v = this;
		cap = 0;
		typ = $ifaceNil;
		s = null;
		kind = new flag(v.flag).kind();
		_ref = kind;
		if (_ref === 17) {
			if (((v.flag & 128) >>> 0) === 0) {
				$panic(new $String("reflect.Value.Slice: slice of unaddressable array"));
			}
			tt = v.typ.kindType;
			cap = (tt.len >> 0);
			typ = SliceOf(tt.elem);
			s = new (jsType(typ))(v.object());
		} else if (_ref === 23) {
			typ = v.typ;
			s = v.object();
			cap = $parseInt(s.$capacity) >> 0;
		} else if (_ref === 24) {
			str = v.ptr.$get();
			if (i < 0 || j < i || j > str.length) {
				$panic(new $String("reflect.Value.Slice: string slice index out of bounds"));
			}
			return ValueOf(new $String(str.substring(i, j)));
		} else {
			$panic(new ValueError.ptr("reflect.Value.Slice", kind));
		}
		if (i < 0 || j < i || j > cap) {
			$panic(new $String("reflect.Value.Slice: slice index out of bounds"));
		}
		return makeValue(typ, $subslice(s, i, j), (v.flag & 32) >>> 0);
	};
	Value.prototype.Slice = function(i, j) { return this.$val.Slice(i, j); };
	Value.ptr.prototype.Slice3 = function(i, j, k) {
		var _ref, cap, i, j, k, kind, s, tt, typ, v;
		v = this;
		cap = 0;
		typ = $ifaceNil;
		s = null;
		kind = new flag(v.flag).kind();
		_ref = kind;
		if (_ref === 17) {
			if (((v.flag & 128) >>> 0) === 0) {
				$panic(new $String("reflect.Value.Slice: slice of unaddressable array"));
			}
			tt = v.typ.kindType;
			cap = (tt.len >> 0);
			typ = SliceOf(tt.elem);
			s = new (jsType(typ))(v.object());
		} else if (_ref === 23) {
			typ = v.typ;
			s = v.object();
			cap = $parseInt(s.$capacity) >> 0;
		} else {
			$panic(new ValueError.ptr("reflect.Value.Slice3", kind));
		}
		if (i < 0 || j < i || k < j || k > cap) {
			$panic(new $String("reflect.Value.Slice3: slice index out of bounds"));
		}
		return makeValue(typ, $subslice(s, i, j, k), (v.flag & 32) >>> 0);
	};
	Value.prototype.Slice3 = function(i, j, k) { return this.$val.Slice3(i, j, k); };
	Value.ptr.prototype.Close = function() {
		var v;
		v = this;
		new flag(v.flag).mustBe(18);
		new flag(v.flag).mustBeExported();
		$close(v.object());
	};
	Value.prototype.Close = function() { return this.$val.Close(); };
	Value.ptr.prototype.TrySend = function(x) {
		var c, tt, v, x;
		v = this;
		x = x;
		new flag(v.flag).mustBe(18);
		new flag(v.flag).mustBeExported();
		tt = v.typ.kindType;
		if (((tt.dir >> 0) & 2) === 0) {
			$panic(new $String("reflect: send on recv-only channel"));
		}
		new flag(x.flag).mustBeExported();
		c = v.object();
		if (!!!(c.$closed) && ($parseInt(c.$recvQueue.length) === 0) && ($parseInt(c.$buffer.length) === ($parseInt(c.$capacity) >> 0))) {
			return false;
		}
		x = x.assignTo("reflect.Value.Send", tt.elem, 0);
		$send(c, x.object());
		return true;
	};
	Value.prototype.TrySend = function(x) { return this.$val.TrySend(x); };
	Value.ptr.prototype.Send = function(x) {
		var v, x;
		v = this;
		x = x;
		$panic(new runtime.NotSupportedError.ptr("reflect.Value.Send, use reflect.Value.TrySend if possible"));
	};
	Value.prototype.Send = function(x) { return this.$val.Send(x); };
	Value.ptr.prototype.TryRecv = function() {
		var _tmp, _tmp$1, _tmp$2, _tmp$3, ok = false, res, tt, v, x = new Value.ptr();
		v = this;
		new flag(v.flag).mustBe(18);
		new flag(v.flag).mustBeExported();
		tt = v.typ.kindType;
		if (((tt.dir >> 0) & 1) === 0) {
			$panic(new $String("reflect: recv on send-only channel"));
		}
		res = $recv(v.object());
		if (res.constructor === $global.Function) {
			_tmp = new Value.ptr(ptrType$1.nil, 0, 0); _tmp$1 = false; x = _tmp; ok = _tmp$1;
			return [x, ok];
		}
		_tmp$2 = makeValue(tt.elem, res[0], 0); _tmp$3 = !!(res[1]); x = _tmp$2; ok = _tmp$3;
		return [x, ok];
	};
	Value.prototype.TryRecv = function() { return this.$val.TryRecv(); };
	Value.ptr.prototype.Recv = function() {
		var ok = false, v, x = new Value.ptr();
		v = this;
		$panic(new runtime.NotSupportedError.ptr("reflect.Value.Recv, use reflect.Value.TryRecv if possible"));
	};
	Value.prototype.Recv = function() { return this.$val.Recv(); };
	Kind.prototype.String = function() {
		var k;
		k = this.$val;
		if ((k >> 0) < kindNames.$length) {
			return ((k < 0 || k >= kindNames.$length) ? $throwRuntimeError("index out of range") : kindNames.$array[kindNames.$offset + k]);
		}
		return "kind" + strconv.Itoa((k >> 0));
	};
	$ptrType(Kind).prototype.String = function() { return new Kind(this.$get()).String(); };
	uncommonType.ptr.prototype.uncommon = function() {
		var t;
		t = this;
		return t;
	};
	uncommonType.prototype.uncommon = function() { return this.$val.uncommon(); };
	uncommonType.ptr.prototype.PkgPath = function() {
		var t;
		t = this;
		if (t === ptrType$5.nil || $pointerIsEqual(t.pkgPath, ptrType$4.nil)) {
			return "";
		}
		return t.pkgPath.$get();
	};
	uncommonType.prototype.PkgPath = function() { return this.$val.PkgPath(); };
	uncommonType.ptr.prototype.Name = function() {
		var t;
		t = this;
		if (t === ptrType$5.nil || $pointerIsEqual(t.name, ptrType$4.nil)) {
			return "";
		}
		return t.name.$get();
	};
	uncommonType.prototype.Name = function() { return this.$val.Name(); };
	rtype.ptr.prototype.String = function() {
		var t;
		t = this;
		return t.string.$get();
	};
	rtype.prototype.String = function() { return this.$val.String(); };
	rtype.ptr.prototype.Size = function() {
		var t;
		t = this;
		return t.size;
	};
	rtype.prototype.Size = function() { return this.$val.Size(); };
	rtype.ptr.prototype.Bits = function() {
		var k, t;
		t = this;
		if (t === ptrType$1.nil) {
			$panic(new $String("reflect: Bits of nil Type"));
		}
		k = t.Kind();
		if (k < 2 || k > 16) {
			$panic(new $String("reflect: Bits of non-arithmetic Type " + t.String()));
		}
		return (t.size >> 0) * 8 >> 0;
	};
	rtype.prototype.Bits = function() { return this.$val.Bits(); };
	rtype.ptr.prototype.Align = function() {
		var t;
		t = this;
		return (t.align >> 0);
	};
	rtype.prototype.Align = function() { return this.$val.Align(); };
	rtype.ptr.prototype.FieldAlign = function() {
		var t;
		t = this;
		return (t.fieldAlign >> 0);
	};
	rtype.prototype.FieldAlign = function() { return this.$val.FieldAlign(); };
	rtype.ptr.prototype.Kind = function() {
		var t;
		t = this;
		return (((t.kind & 31) >>> 0) >>> 0);
	};
	rtype.prototype.Kind = function() { return this.$val.Kind(); };
	rtype.ptr.prototype.common = function() {
		var t;
		t = this;
		return t;
	};
	rtype.prototype.common = function() { return this.$val.common(); };
	uncommonType.ptr.prototype.NumMethod = function() {
		var t;
		t = this;
		if (t === ptrType$5.nil) {
			return 0;
		}
		return t.methods.$length;
	};
	uncommonType.prototype.NumMethod = function() { return this.$val.NumMethod(); };
	uncommonType.ptr.prototype.MethodByName = function(name) {
		var _i, _ref, _tmp, _tmp$1, i, m = new Method.ptr(), name, ok = false, p, t, x;
		t = this;
		if (t === ptrType$5.nil) {
			return [m, ok];
		}
		p = ptrType$9.nil;
		_ref = t.methods;
		_i = 0;
		while (true) {
			if (!(_i < _ref.$length)) { break; }
			i = _i;
			p = (x = t.methods, ((i < 0 || i >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + i]));
			if (!($pointerIsEqual(p.name, ptrType$4.nil)) && p.name.$get() === name) {
				_tmp = $clone(t.Method(i), Method); _tmp$1 = true; $copy(m, _tmp, Method); ok = _tmp$1;
				return [m, ok];
			}
			_i++;
		}
		return [m, ok];
	};
	uncommonType.prototype.MethodByName = function(name) { return this.$val.MethodByName(name); };
	rtype.ptr.prototype.NumMethod = function() {
		var t, tt;
		t = this;
		if (t.Kind() === 20) {
			tt = t.kindType;
			return tt.NumMethod();
		}
		return t.uncommonType.NumMethod();
	};
	rtype.prototype.NumMethod = function() { return this.$val.NumMethod(); };
	rtype.ptr.prototype.Method = function(i) {
		var i, m = new Method.ptr(), t, tt;
		t = this;
		if (t.Kind() === 20) {
			tt = t.kindType;
			$copy(m, tt.Method(i), Method);
			return m;
		}
		$copy(m, t.uncommonType.Method(i), Method);
		return m;
	};
	rtype.prototype.Method = function(i) { return this.$val.Method(i); };
	rtype.ptr.prototype.MethodByName = function(name) {
		var _tuple, _tuple$1, m = new Method.ptr(), name, ok = false, t, tt;
		t = this;
		if (t.Kind() === 20) {
			tt = t.kindType;
			_tuple = tt.MethodByName(name); $copy(m, _tuple[0], Method); ok = _tuple[1];
			return [m, ok];
		}
		_tuple$1 = t.uncommonType.MethodByName(name); $copy(m, _tuple$1[0], Method); ok = _tuple$1[1];
		return [m, ok];
	};
	rtype.prototype.MethodByName = function(name) { return this.$val.MethodByName(name); };
	rtype.ptr.prototype.PkgPath = function() {
		var t;
		t = this;
		return t.uncommonType.PkgPath();
	};
	rtype.prototype.PkgPath = function() { return this.$val.PkgPath(); };
	rtype.ptr.prototype.Name = function() {
		var t;
		t = this;
		return t.uncommonType.Name();
	};
	rtype.prototype.Name = function() { return this.$val.Name(); };
	rtype.ptr.prototype.ChanDir = function() {
		var t, tt;
		t = this;
		if (!((t.Kind() === 18))) {
			$panic(new $String("reflect: ChanDir of non-chan type"));
		}
		tt = t.kindType;
		return (tt.dir >> 0);
	};
	rtype.prototype.ChanDir = function() { return this.$val.ChanDir(); };
	rtype.ptr.prototype.IsVariadic = function() {
		var t, tt;
		t = this;
		if (!((t.Kind() === 19))) {
			$panic(new $String("reflect: IsVariadic of non-func type"));
		}
		tt = t.kindType;
		return tt.dotdotdot;
	};
	rtype.prototype.IsVariadic = function() { return this.$val.IsVariadic(); };
	rtype.ptr.prototype.Elem = function() {
		var _ref, t, tt, tt$1, tt$2, tt$3, tt$4;
		t = this;
		_ref = t.Kind();
		if (_ref === 17) {
			tt = t.kindType;
			return toType(tt.elem);
		} else if (_ref === 18) {
			tt$1 = t.kindType;
			return toType(tt$1.elem);
		} else if (_ref === 21) {
			tt$2 = t.kindType;
			return toType(tt$2.elem);
		} else if (_ref === 22) {
			tt$3 = t.kindType;
			return toType(tt$3.elem);
		} else if (_ref === 23) {
			tt$4 = t.kindType;
			return toType(tt$4.elem);
		}
		$panic(new $String("reflect: Elem of invalid type"));
	};
	rtype.prototype.Elem = function() { return this.$val.Elem(); };
	rtype.ptr.prototype.Field = function(i) {
		var i, t, tt;
		t = this;
		if (!((t.Kind() === 25))) {
			$panic(new $String("reflect: Field of non-struct type"));
		}
		tt = t.kindType;
		return tt.Field(i);
	};
	rtype.prototype.Field = function(i) { return this.$val.Field(i); };
	rtype.ptr.prototype.FieldByIndex = function(index) {
		var index, t, tt;
		t = this;
		if (!((t.Kind() === 25))) {
			$panic(new $String("reflect: FieldByIndex of non-struct type"));
		}
		tt = t.kindType;
		return tt.FieldByIndex(index);
	};
	rtype.prototype.FieldByIndex = function(index) { return this.$val.FieldByIndex(index); };
	rtype.ptr.prototype.FieldByName = function(name) {
		var name, t, tt;
		t = this;
		if (!((t.Kind() === 25))) {
			$panic(new $String("reflect: FieldByName of non-struct type"));
		}
		tt = t.kindType;
		return tt.FieldByName(name);
	};
	rtype.prototype.FieldByName = function(name) { return this.$val.FieldByName(name); };
	rtype.ptr.prototype.FieldByNameFunc = function(match) {
		var match, t, tt;
		t = this;
		if (!((t.Kind() === 25))) {
			$panic(new $String("reflect: FieldByNameFunc of non-struct type"));
		}
		tt = t.kindType;
		return tt.FieldByNameFunc(match);
	};
	rtype.prototype.FieldByNameFunc = function(match) { return this.$val.FieldByNameFunc(match); };
	rtype.ptr.prototype.In = function(i) {
		var i, t, tt, x;
		t = this;
		if (!((t.Kind() === 19))) {
			$panic(new $String("reflect: In of non-func type"));
		}
		tt = t.kindType;
		return toType((x = tt.in$2, ((i < 0 || i >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + i])));
	};
	rtype.prototype.In = function(i) { return this.$val.In(i); };
	rtype.ptr.prototype.Key = function() {
		var t, tt;
		t = this;
		if (!((t.Kind() === 21))) {
			$panic(new $String("reflect: Key of non-map type"));
		}
		tt = t.kindType;
		return toType(tt.key);
	};
	rtype.prototype.Key = function() { return this.$val.Key(); };
	rtype.ptr.prototype.Len = function() {
		var t, tt;
		t = this;
		if (!((t.Kind() === 17))) {
			$panic(new $String("reflect: Len of non-array type"));
		}
		tt = t.kindType;
		return (tt.len >> 0);
	};
	rtype.prototype.Len = function() { return this.$val.Len(); };
	rtype.ptr.prototype.NumField = function() {
		var t, tt;
		t = this;
		if (!((t.Kind() === 25))) {
			$panic(new $String("reflect: NumField of non-struct type"));
		}
		tt = t.kindType;
		return tt.fields.$length;
	};
	rtype.prototype.NumField = function() { return this.$val.NumField(); };
	rtype.ptr.prototype.NumIn = function() {
		var t, tt;
		t = this;
		if (!((t.Kind() === 19))) {
			$panic(new $String("reflect: NumIn of non-func type"));
		}
		tt = t.kindType;
		return tt.in$2.$length;
	};
	rtype.prototype.NumIn = function() { return this.$val.NumIn(); };
	rtype.ptr.prototype.NumOut = function() {
		var t, tt;
		t = this;
		if (!((t.Kind() === 19))) {
			$panic(new $String("reflect: NumOut of non-func type"));
		}
		tt = t.kindType;
		return tt.out.$length;
	};
	rtype.prototype.NumOut = function() { return this.$val.NumOut(); };
	rtype.ptr.prototype.Out = function(i) {
		var i, t, tt, x;
		t = this;
		if (!((t.Kind() === 19))) {
			$panic(new $String("reflect: Out of non-func type"));
		}
		tt = t.kindType;
		return toType((x = tt.out, ((i < 0 || i >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + i])));
	};
	rtype.prototype.Out = function(i) { return this.$val.Out(i); };
	ChanDir.prototype.String = function() {
		var _ref, d;
		d = this.$val;
		_ref = d;
		if (_ref === 2) {
			return "chan<-";
		} else if (_ref === 1) {
			return "<-chan";
		} else if (_ref === 3) {
			return "chan";
		}
		return "ChanDir" + strconv.Itoa((d >> 0));
	};
	$ptrType(ChanDir).prototype.String = function() { return new ChanDir(this.$get()).String(); };
	interfaceType.ptr.prototype.Method = function(i) {
		var i, m = new Method.ptr(), p, t, x;
		t = this;
		if (i < 0 || i >= t.methods.$length) {
			return m;
		}
		p = (x = t.methods, ((i < 0 || i >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + i]));
		m.Name = p.name.$get();
		if (!($pointerIsEqual(p.pkgPath, ptrType$4.nil))) {
			m.PkgPath = p.pkgPath.$get();
		}
		m.Type = toType(p.typ);
		m.Index = i;
		return m;
	};
	interfaceType.prototype.Method = function(i) { return this.$val.Method(i); };
	interfaceType.ptr.prototype.NumMethod = function() {
		var t;
		t = this;
		return t.methods.$length;
	};
	interfaceType.prototype.NumMethod = function() { return this.$val.NumMethod(); };
	interfaceType.ptr.prototype.MethodByName = function(name) {
		var _i, _ref, _tmp, _tmp$1, i, m = new Method.ptr(), name, ok = false, p, t, x;
		t = this;
		if (t === ptrType$10.nil) {
			return [m, ok];
		}
		p = ptrType$11.nil;
		_ref = t.methods;
		_i = 0;
		while (true) {
			if (!(_i < _ref.$length)) { break; }
			i = _i;
			p = (x = t.methods, ((i < 0 || i >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + i]));
			if (p.name.$get() === name) {
				_tmp = $clone(t.Method(i), Method); _tmp$1 = true; $copy(m, _tmp, Method); ok = _tmp$1;
				return [m, ok];
			}
			_i++;
		}
		return [m, ok];
	};
	interfaceType.prototype.MethodByName = function(name) { return this.$val.MethodByName(name); };
	StructTag.prototype.Get = function(key) {
		var _tuple, i, key, name, qvalue, tag, value;
		tag = this.$val;
		while (true) {
			if (!(!(tag === ""))) { break; }
			i = 0;
			while (true) {
				if (!(i < tag.length && (tag.charCodeAt(i) === 32))) { break; }
				i = i + (1) >> 0;
			}
			tag = tag.substring(i);
			if (tag === "") {
				break;
			}
			i = 0;
			while (true) {
				if (!(i < tag.length && !((tag.charCodeAt(i) === 32)) && !((tag.charCodeAt(i) === 58)) && !((tag.charCodeAt(i) === 34)))) { break; }
				i = i + (1) >> 0;
			}
			if ((i + 1 >> 0) >= tag.length || !((tag.charCodeAt(i) === 58)) || !((tag.charCodeAt((i + 1 >> 0)) === 34))) {
				break;
			}
			name = tag.substring(0, i);
			tag = tag.substring((i + 1 >> 0));
			i = 1;
			while (true) {
				if (!(i < tag.length && !((tag.charCodeAt(i) === 34)))) { break; }
				if (tag.charCodeAt(i) === 92) {
					i = i + (1) >> 0;
				}
				i = i + (1) >> 0;
			}
			if (i >= tag.length) {
				break;
			}
			qvalue = tag.substring(0, (i + 1 >> 0));
			tag = tag.substring((i + 1 >> 0));
			if (key === name) {
				_tuple = strconv.Unquote(qvalue); value = _tuple[0];
				return value;
			}
		}
		return "";
	};
	$ptrType(StructTag).prototype.Get = function(key) { return new StructTag(this.$get()).Get(key); };
	structType.ptr.prototype.Field = function(i) {
		var f = new StructField.ptr(), i, p, t, t$1, x;
		t = this;
		if (i < 0 || i >= t.fields.$length) {
			return f;
		}
		p = (x = t.fields, ((i < 0 || i >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + i]));
		f.Type = toType(p.typ);
		if (!($pointerIsEqual(p.name, ptrType$4.nil))) {
			f.Name = p.name.$get();
		} else {
			t$1 = f.Type;
			if (t$1.Kind() === 22) {
				t$1 = t$1.Elem();
			}
			f.Name = t$1.Name();
			f.Anonymous = true;
		}
		if (!($pointerIsEqual(p.pkgPath, ptrType$4.nil))) {
			f.PkgPath = p.pkgPath.$get();
		}
		if (!($pointerIsEqual(p.tag, ptrType$4.nil))) {
			f.Tag = p.tag.$get();
		}
		f.Offset = p.offset;
		f.Index = new sliceType$9([i]);
		return f;
	};
	structType.prototype.Field = function(i) { return this.$val.Field(i); };
	structType.ptr.prototype.FieldByIndex = function(index) {
		var _i, _ref, f = new StructField.ptr(), ft, i, index, t, x;
		t = this;
		f.Type = toType(t.rtype);
		_ref = index;
		_i = 0;
		while (true) {
			if (!(_i < _ref.$length)) { break; }
			i = _i;
			x = ((_i < 0 || _i >= _ref.$length) ? $throwRuntimeError("index out of range") : _ref.$array[_ref.$offset + _i]);
			if (i > 0) {
				ft = f.Type;
				if ((ft.Kind() === 22) && (ft.Elem().Kind() === 25)) {
					ft = ft.Elem();
				}
				f.Type = ft;
			}
			$copy(f, f.Type.Field(x), StructField);
			_i++;
		}
		return f;
	};
	structType.prototype.FieldByIndex = function(index) { return this.$val.FieldByIndex(index); };
	structType.ptr.prototype.FieldByNameFunc = function(match) {
		var _entry, _entry$1, _entry$2, _entry$3, _i, _i$1, _key, _key$1, _key$2, _key$3, _key$4, _key$5, _map, _map$1, _ref, _ref$1, _tmp, _tmp$1, _tmp$2, _tmp$3, count, current, f, fname, i, index, match, next, nextCount, ntyp, ok = false, result = new StructField.ptr(), scan, styp, t, t$1, visited, x;
		t = this;
		current = new sliceType$10([]);
		next = new sliceType$10([new fieldScan.ptr(t, sliceType$9.nil)]);
		nextCount = false;
		visited = (_map = new $Map(), _map);
		while (true) {
			if (!(next.$length > 0)) { break; }
			_tmp = next; _tmp$1 = $subslice(current, 0, 0); current = _tmp; next = _tmp$1;
			count = nextCount;
			nextCount = false;
			_ref = current;
			_i = 0;
			while (true) {
				if (!(_i < _ref.$length)) { break; }
				scan = $clone(((_i < 0 || _i >= _ref.$length) ? $throwRuntimeError("index out of range") : _ref.$array[_ref.$offset + _i]), fieldScan);
				t$1 = scan.typ;
				if ((_entry = visited[t$1.$key()], _entry !== undefined ? _entry.v : false)) {
					_i++;
					continue;
				}
				_key$1 = t$1; (visited || $throwRuntimeError("assignment to entry in nil map"))[_key$1.$key()] = { k: _key$1, v: true };
				_ref$1 = t$1.fields;
				_i$1 = 0;
				while (true) {
					if (!(_i$1 < _ref$1.$length)) { break; }
					i = _i$1;
					f = (x = t$1.fields, ((i < 0 || i >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + i]));
					fname = "";
					ntyp = ptrType$1.nil;
					if (!($pointerIsEqual(f.name, ptrType$4.nil))) {
						fname = f.name.$get();
					} else {
						ntyp = f.typ;
						if (ntyp.Kind() === 22) {
							ntyp = ntyp.Elem().common();
						}
						fname = ntyp.Name();
					}
					if (match(fname)) {
						if ((_entry$1 = count[t$1.$key()], _entry$1 !== undefined ? _entry$1.v : 0) > 1 || ok) {
							_tmp$2 = new StructField.ptr("", "", $ifaceNil, "", 0, sliceType$9.nil, false); _tmp$3 = false; $copy(result, _tmp$2, StructField); ok = _tmp$3;
							return [result, ok];
						}
						$copy(result, t$1.Field(i), StructField);
						result.Index = sliceType$9.nil;
						result.Index = $appendSlice(result.Index, scan.index);
						result.Index = $append(result.Index, i);
						ok = true;
						_i$1++;
						continue;
					}
					if (ok || ntyp === ptrType$1.nil || !((ntyp.Kind() === 25))) {
						_i$1++;
						continue;
					}
					styp = ntyp.kindType;
					if ((_entry$2 = nextCount[styp.$key()], _entry$2 !== undefined ? _entry$2.v : 0) > 0) {
						_key$2 = styp; (nextCount || $throwRuntimeError("assignment to entry in nil map"))[_key$2.$key()] = { k: _key$2, v: 2 };
						_i$1++;
						continue;
					}
					if (nextCount === false) {
						nextCount = (_map$1 = new $Map(), _map$1);
					}
					_key$4 = styp; (nextCount || $throwRuntimeError("assignment to entry in nil map"))[_key$4.$key()] = { k: _key$4, v: 1 };
					if ((_entry$3 = count[t$1.$key()], _entry$3 !== undefined ? _entry$3.v : 0) > 1) {
						_key$5 = styp; (nextCount || $throwRuntimeError("assignment to entry in nil map"))[_key$5.$key()] = { k: _key$5, v: 2 };
					}
					index = sliceType$9.nil;
					index = $appendSlice(index, scan.index);
					index = $append(index, i);
					next = $append(next, new fieldScan.ptr(styp, index));
					_i$1++;
				}
				_i++;
			}
			if (ok) {
				break;
			}
		}
		return [result, ok];
	};
	structType.prototype.FieldByNameFunc = function(match) { return this.$val.FieldByNameFunc(match); };
	structType.ptr.prototype.FieldByName = function(name) {
		var _i, _ref, _tmp, _tmp$1, _tuple, f = new StructField.ptr(), hasAnon, i, name, present = false, t, tf, x;
		t = this;
		hasAnon = false;
		if (!(name === "")) {
			_ref = t.fields;
			_i = 0;
			while (true) {
				if (!(_i < _ref.$length)) { break; }
				i = _i;
				tf = (x = t.fields, ((i < 0 || i >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + i]));
				if ($pointerIsEqual(tf.name, ptrType$4.nil)) {
					hasAnon = true;
					_i++;
					continue;
				}
				if (tf.name.$get() === name) {
					_tmp = $clone(t.Field(i), StructField); _tmp$1 = true; $copy(f, _tmp, StructField); present = _tmp$1;
					return [f, present];
				}
				_i++;
			}
		}
		if (!hasAnon) {
			return [f, present];
		}
		_tuple = t.FieldByNameFunc((function(s) {
			var s;
			return s === name;
		})); $copy(f, _tuple[0], StructField); present = _tuple[1];
		return [f, present];
	};
	structType.prototype.FieldByName = function(name) { return this.$val.FieldByName(name); };
	PtrTo = $pkg.PtrTo = function(t) {
		var t;
		return $assertType(t, ptrType$1).ptrTo();
	};
	rtype.ptr.prototype.Implements = function(u) {
		var t, u;
		t = this;
		if ($interfaceIsEqual(u, $ifaceNil)) {
			$panic(new $String("reflect: nil type passed to Type.Implements"));
		}
		if (!((u.Kind() === 20))) {
			$panic(new $String("reflect: non-interface type passed to Type.Implements"));
		}
		return implements$1($assertType(u, ptrType$1), t);
	};
	rtype.prototype.Implements = function(u) { return this.$val.Implements(u); };
	rtype.ptr.prototype.AssignableTo = function(u) {
		var t, u, uu;
		t = this;
		if ($interfaceIsEqual(u, $ifaceNil)) {
			$panic(new $String("reflect: nil type passed to Type.AssignableTo"));
		}
		uu = $assertType(u, ptrType$1);
		return directlyAssignable(uu, t) || implements$1(uu, t);
	};
	rtype.prototype.AssignableTo = function(u) { return this.$val.AssignableTo(u); };
	rtype.ptr.prototype.ConvertibleTo = function(u) {
		var t, u, uu;
		t = this;
		if ($interfaceIsEqual(u, $ifaceNil)) {
			$panic(new $String("reflect: nil type passed to Type.ConvertibleTo"));
		}
		uu = $assertType(u, ptrType$1);
		return !(convertOp(uu, t) === $throwNilPointerError);
	};
	rtype.prototype.ConvertibleTo = function(u) { return this.$val.ConvertibleTo(u); };
	implements$1 = function(T, V) {
		var T, V, i, i$1, j, j$1, t, tm, tm$1, v, v$1, vm, vm$1, x, x$1, x$2, x$3;
		if (!((T.Kind() === 20))) {
			return false;
		}
		t = T.kindType;
		if (t.methods.$length === 0) {
			return true;
		}
		if (V.Kind() === 20) {
			v = V.kindType;
			i = 0;
			j = 0;
			while (true) {
				if (!(j < v.methods.$length)) { break; }
				tm = (x = t.methods, ((i < 0 || i >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + i]));
				vm = (x$1 = v.methods, ((j < 0 || j >= x$1.$length) ? $throwRuntimeError("index out of range") : x$1.$array[x$1.$offset + j]));
				if ($pointerIsEqual(vm.name, tm.name) && $pointerIsEqual(vm.pkgPath, tm.pkgPath) && vm.typ === tm.typ) {
					i = i + (1) >> 0;
					if (i >= t.methods.$length) {
						return true;
					}
				}
				j = j + (1) >> 0;
			}
			return false;
		}
		v$1 = V.uncommonType.uncommon();
		if (v$1 === ptrType$5.nil) {
			return false;
		}
		i$1 = 0;
		j$1 = 0;
		while (true) {
			if (!(j$1 < v$1.methods.$length)) { break; }
			tm$1 = (x$2 = t.methods, ((i$1 < 0 || i$1 >= x$2.$length) ? $throwRuntimeError("index out of range") : x$2.$array[x$2.$offset + i$1]));
			vm$1 = (x$3 = v$1.methods, ((j$1 < 0 || j$1 >= x$3.$length) ? $throwRuntimeError("index out of range") : x$3.$array[x$3.$offset + j$1]));
			if ($pointerIsEqual(vm$1.name, tm$1.name) && $pointerIsEqual(vm$1.pkgPath, tm$1.pkgPath) && vm$1.mtyp === tm$1.typ) {
				i$1 = i$1 + (1) >> 0;
				if (i$1 >= t.methods.$length) {
					return true;
				}
			}
			j$1 = j$1 + (1) >> 0;
		}
		return false;
	};
	directlyAssignable = function(T, V) {
		var T, V;
		if (T === V) {
			return true;
		}
		if (!(T.Name() === "") && !(V.Name() === "") || !((T.Kind() === V.Kind()))) {
			return false;
		}
		return haveIdenticalUnderlyingType(T, V);
	};
	haveIdenticalUnderlyingType = function(T, V) {
		var T, V, _i, _i$1, _i$2, _ref, _ref$1, _ref$2, _ref$3, i, i$1, i$2, kind, t, t$1, t$2, tf, typ, typ$1, v, v$1, v$2, vf, x, x$1, x$2, x$3;
		if (T === V) {
			return true;
		}
		kind = T.Kind();
		if (!((kind === V.Kind()))) {
			return false;
		}
		if (1 <= kind && kind <= 16 || (kind === 24) || (kind === 26)) {
			return true;
		}
		_ref = kind;
		if (_ref === 17) {
			return $interfaceIsEqual(T.Elem(), V.Elem()) && (T.Len() === V.Len());
		} else if (_ref === 18) {
			if ((V.ChanDir() === 3) && $interfaceIsEqual(T.Elem(), V.Elem())) {
				return true;
			}
			return (V.ChanDir() === T.ChanDir()) && $interfaceIsEqual(T.Elem(), V.Elem());
		} else if (_ref === 19) {
			t = T.kindType;
			v = V.kindType;
			if (!(t.dotdotdot === v.dotdotdot) || !((t.in$2.$length === v.in$2.$length)) || !((t.out.$length === v.out.$length))) {
				return false;
			}
			_ref$1 = t.in$2;
			_i = 0;
			while (true) {
				if (!(_i < _ref$1.$length)) { break; }
				i = _i;
				typ = ((_i < 0 || _i >= _ref$1.$length) ? $throwRuntimeError("index out of range") : _ref$1.$array[_ref$1.$offset + _i]);
				if (!(typ === (x = v.in$2, ((i < 0 || i >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + i])))) {
					return false;
				}
				_i++;
			}
			_ref$2 = t.out;
			_i$1 = 0;
			while (true) {
				if (!(_i$1 < _ref$2.$length)) { break; }
				i$1 = _i$1;
				typ$1 = ((_i$1 < 0 || _i$1 >= _ref$2.$length) ? $throwRuntimeError("index out of range") : _ref$2.$array[_ref$2.$offset + _i$1]);
				if (!(typ$1 === (x$1 = v.out, ((i$1 < 0 || i$1 >= x$1.$length) ? $throwRuntimeError("index out of range") : x$1.$array[x$1.$offset + i$1])))) {
					return false;
				}
				_i$1++;
			}
			return true;
		} else if (_ref === 20) {
			t$1 = T.kindType;
			v$1 = V.kindType;
			if ((t$1.methods.$length === 0) && (v$1.methods.$length === 0)) {
				return true;
			}
			return false;
		} else if (_ref === 21) {
			return $interfaceIsEqual(T.Key(), V.Key()) && $interfaceIsEqual(T.Elem(), V.Elem());
		} else if (_ref === 22 || _ref === 23) {
			return $interfaceIsEqual(T.Elem(), V.Elem());
		} else if (_ref === 25) {
			t$2 = T.kindType;
			v$2 = V.kindType;
			if (!((t$2.fields.$length === v$2.fields.$length))) {
				return false;
			}
			_ref$3 = t$2.fields;
			_i$2 = 0;
			while (true) {
				if (!(_i$2 < _ref$3.$length)) { break; }
				i$2 = _i$2;
				tf = (x$2 = t$2.fields, ((i$2 < 0 || i$2 >= x$2.$length) ? $throwRuntimeError("index out of range") : x$2.$array[x$2.$offset + i$2]));
				vf = (x$3 = v$2.fields, ((i$2 < 0 || i$2 >= x$3.$length) ? $throwRuntimeError("index out of range") : x$3.$array[x$3.$offset + i$2]));
				if (!($pointerIsEqual(tf.name, vf.name)) && ($pointerIsEqual(tf.name, ptrType$4.nil) || $pointerIsEqual(vf.name, ptrType$4.nil) || !(tf.name.$get() === vf.name.$get()))) {
					return false;
				}
				if (!($pointerIsEqual(tf.pkgPath, vf.pkgPath)) && ($pointerIsEqual(tf.pkgPath, ptrType$4.nil) || $pointerIsEqual(vf.pkgPath, ptrType$4.nil) || !(tf.pkgPath.$get() === vf.pkgPath.$get()))) {
					return false;
				}
				if (!(tf.typ === vf.typ)) {
					return false;
				}
				if (!($pointerIsEqual(tf.tag, vf.tag)) && ($pointerIsEqual(tf.tag, ptrType$4.nil) || $pointerIsEqual(vf.tag, ptrType$4.nil) || !(tf.tag.$get() === vf.tag.$get()))) {
					return false;
				}
				if (!((tf.offset === vf.offset))) {
					return false;
				}
				_i$2++;
			}
			return true;
		}
		return false;
	};
	toType = function(t) {
		var t;
		if (t === ptrType$1.nil) {
			return $ifaceNil;
		}
		return t;
	};
	ifaceIndir = function(t) {
		var t;
		return ((t.kind & 32) >>> 0) === 0;
	};
	flag.prototype.kind = function() {
		var f;
		f = this.$val;
		return (((f & 31) >>> 0) >>> 0);
	};
	$ptrType(flag).prototype.kind = function() { return new flag(this.$get()).kind(); };
	Value.ptr.prototype.pointer = function() {
		var v;
		v = this;
		if (!((v.typ.size === 4)) || !v.typ.pointers()) {
			$panic(new $String("can't call pointer on a non-pointer Value"));
		}
		if (!((((v.flag & 64) >>> 0) === 0))) {
			return v.ptr.$get();
		}
		return v.ptr;
	};
	Value.prototype.pointer = function() { return this.$val.pointer(); };
	ValueError.ptr.prototype.Error = function() {
		var e;
		e = this;
		if (e.Kind === 0) {
			return "reflect: call of " + e.Method + " on zero Value";
		}
		return "reflect: call of " + e.Method + " on " + new Kind(e.Kind).String() + " Value";
	};
	ValueError.prototype.Error = function() { return this.$val.Error(); };
	flag.prototype.mustBe = function(expected) {
		var expected, f;
		f = this.$val;
		if (!((new flag(f).kind() === expected))) {
			$panic(new ValueError.ptr(methodName(), new flag(f).kind()));
		}
	};
	$ptrType(flag).prototype.mustBe = function(expected) { return new flag(this.$get()).mustBe(expected); };
	flag.prototype.mustBeExported = function() {
		var f;
		f = this.$val;
		if (f === 0) {
			$panic(new ValueError.ptr(methodName(), 0));
		}
		if (!((((f & 32) >>> 0) === 0))) {
			$panic(new $String("reflect: " + methodName() + " using value obtained using unexported field"));
		}
	};
	$ptrType(flag).prototype.mustBeExported = function() { return new flag(this.$get()).mustBeExported(); };
	flag.prototype.mustBeAssignable = function() {
		var f;
		f = this.$val;
		if (f === 0) {
			$panic(new ValueError.ptr(methodName(), 0));
		}
		if (!((((f & 32) >>> 0) === 0))) {
			$panic(new $String("reflect: " + methodName() + " using value obtained using unexported field"));
		}
		if (((f & 128) >>> 0) === 0) {
			$panic(new $String("reflect: " + methodName() + " using unaddressable value"));
		}
	};
	$ptrType(flag).prototype.mustBeAssignable = function() { return new flag(this.$get()).mustBeAssignable(); };
	Value.ptr.prototype.Addr = function() {
		var v;
		v = this;
		if (((v.flag & 128) >>> 0) === 0) {
			$panic(new $String("reflect.Value.Addr of unaddressable value"));
		}
		return new Value.ptr(v.typ.ptrTo(), v.ptr, ((((v.flag & 32) >>> 0)) | 22) >>> 0);
	};
	Value.prototype.Addr = function() { return this.$val.Addr(); };
	Value.ptr.prototype.Bool = function() {
		var v;
		v = this;
		new flag(v.flag).mustBe(1);
		return v.ptr.$get();
	};
	Value.prototype.Bool = function() { return this.$val.Bool(); };
	Value.ptr.prototype.Bytes = function() {
		var v;
		v = this;
		new flag(v.flag).mustBe(23);
		if (!((v.typ.Elem().Kind() === 8))) {
			$panic(new $String("reflect.Value.Bytes of non-byte slice"));
		}
		return v.ptr.$get();
	};
	Value.prototype.Bytes = function() { return this.$val.Bytes(); };
	Value.ptr.prototype.runes = function() {
		var v;
		v = this;
		new flag(v.flag).mustBe(23);
		if (!((v.typ.Elem().Kind() === 5))) {
			$panic(new $String("reflect.Value.Bytes of non-rune slice"));
		}
		return v.ptr.$get();
	};
	Value.prototype.runes = function() { return this.$val.runes(); };
	Value.ptr.prototype.CanAddr = function() {
		var v;
		v = this;
		return !((((v.flag & 128) >>> 0) === 0));
	};
	Value.prototype.CanAddr = function() { return this.$val.CanAddr(); };
	Value.ptr.prototype.CanSet = function() {
		var v;
		v = this;
		return ((v.flag & 160) >>> 0) === 128;
	};
	Value.prototype.CanSet = function() { return this.$val.CanSet(); };
	Value.ptr.prototype.Call = function(in$1) {
		var in$1, v;
		v = this;
		new flag(v.flag).mustBe(19);
		new flag(v.flag).mustBeExported();
		return v.call("Call", in$1);
	};
	Value.prototype.Call = function(in$1) { return this.$val.Call(in$1); };
	Value.ptr.prototype.CallSlice = function(in$1) {
		var in$1, v;
		v = this;
		new flag(v.flag).mustBe(19);
		new flag(v.flag).mustBeExported();
		return v.call("CallSlice", in$1);
	};
	Value.prototype.CallSlice = function(in$1) { return this.$val.CallSlice(in$1); };
	Value.ptr.prototype.Complex = function() {
		var _ref, k, v, x;
		v = this;
		k = new flag(v.flag).kind();
		_ref = k;
		if (_ref === 15) {
			return (x = v.ptr.$get(), new $Complex128(x.$real, x.$imag));
		} else if (_ref === 16) {
			return v.ptr.$get();
		}
		$panic(new ValueError.ptr("reflect.Value.Complex", new flag(v.flag).kind()));
	};
	Value.prototype.Complex = function() { return this.$val.Complex(); };
	Value.ptr.prototype.FieldByIndex = function(index) {
		var _i, _ref, i, index, v, x;
		v = this;
		if (index.$length === 1) {
			return v.Field(((0 < 0 || 0 >= index.$length) ? $throwRuntimeError("index out of range") : index.$array[index.$offset + 0]));
		}
		new flag(v.flag).mustBe(25);
		_ref = index;
		_i = 0;
		while (true) {
			if (!(_i < _ref.$length)) { break; }
			i = _i;
			x = ((_i < 0 || _i >= _ref.$length) ? $throwRuntimeError("index out of range") : _ref.$array[_ref.$offset + _i]);
			if (i > 0) {
				if ((v.Kind() === 22) && (v.typ.Elem().Kind() === 25)) {
					if (v.IsNil()) {
						$panic(new $String("reflect: indirection through nil pointer to embedded struct"));
					}
					v = v.Elem();
				}
			}
			v = v.Field(x);
			_i++;
		}
		return v;
	};
	Value.prototype.FieldByIndex = function(index) { return this.$val.FieldByIndex(index); };
	Value.ptr.prototype.FieldByName = function(name) {
		var _tuple, f, name, ok, v;
		v = this;
		new flag(v.flag).mustBe(25);
		_tuple = v.typ.FieldByName(name); f = $clone(_tuple[0], StructField); ok = _tuple[1];
		if (ok) {
			return v.FieldByIndex(f.Index);
		}
		return new Value.ptr(ptrType$1.nil, 0, 0);
	};
	Value.prototype.FieldByName = function(name) { return this.$val.FieldByName(name); };
	Value.ptr.prototype.FieldByNameFunc = function(match) {
		var _tuple, f, match, ok, v;
		v = this;
		_tuple = v.typ.FieldByNameFunc(match); f = $clone(_tuple[0], StructField); ok = _tuple[1];
		if (ok) {
			return v.FieldByIndex(f.Index);
		}
		return new Value.ptr(ptrType$1.nil, 0, 0);
	};
	Value.prototype.FieldByNameFunc = function(match) { return this.$val.FieldByNameFunc(match); };
	Value.ptr.prototype.Float = function() {
		var _ref, k, v;
		v = this;
		k = new flag(v.flag).kind();
		_ref = k;
		if (_ref === 13) {
			return $coerceFloat32(v.ptr.$get());
		} else if (_ref === 14) {
			return v.ptr.$get();
		}
		$panic(new ValueError.ptr("reflect.Value.Float", new flag(v.flag).kind()));
	};
	Value.prototype.Float = function() { return this.$val.Float(); };
	Value.ptr.prototype.Int = function() {
		var _ref, k, p, v;
		v = this;
		k = new flag(v.flag).kind();
		p = v.ptr;
		_ref = k;
		if (_ref === 2) {
			return new $Int64(0, p.$get());
		} else if (_ref === 3) {
			return new $Int64(0, p.$get());
		} else if (_ref === 4) {
			return new $Int64(0, p.$get());
		} else if (_ref === 5) {
			return new $Int64(0, p.$get());
		} else if (_ref === 6) {
			return p.$get();
		}
		$panic(new ValueError.ptr("reflect.Value.Int", new flag(v.flag).kind()));
	};
	Value.prototype.Int = function() { return this.$val.Int(); };
	Value.ptr.prototype.CanInterface = function() {
		var v;
		v = this;
		if (v.flag === 0) {
			$panic(new ValueError.ptr("reflect.Value.CanInterface", 0));
		}
		return ((v.flag & 32) >>> 0) === 0;
	};
	Value.prototype.CanInterface = function() { return this.$val.CanInterface(); };
	Value.ptr.prototype.Interface = function() {
		var i = $ifaceNil, v;
		v = this;
		i = valueInterface(v, true);
		return i;
	};
	Value.prototype.Interface = function() { return this.$val.Interface(); };
	Value.ptr.prototype.InterfaceData = function() {
		var v;
		v = this;
		new flag(v.flag).mustBe(20);
		return v.ptr;
	};
	Value.prototype.InterfaceData = function() { return this.$val.InterfaceData(); };
	Value.ptr.prototype.IsValid = function() {
		var v;
		v = this;
		return !((v.flag === 0));
	};
	Value.prototype.IsValid = function() { return this.$val.IsValid(); };
	Value.ptr.prototype.Kind = function() {
		var v;
		v = this;
		return new flag(v.flag).kind();
	};
	Value.prototype.Kind = function() { return this.$val.Kind(); };
	Value.ptr.prototype.MapIndex = function(key) {
		var c, e, fl, k, key, tt, typ, v;
		v = this;
		key = key;
		new flag(v.flag).mustBe(21);
		tt = v.typ.kindType;
		key = key.assignTo("reflect.Value.MapIndex", tt.key, 0);
		k = 0;
		if (!((((key.flag & 64) >>> 0) === 0))) {
			k = key.ptr;
		} else {
			k = new ptrType$17(function() { return this.$target.ptr; }, function($v) { this.$target.ptr = $v; }, key);
		}
		e = mapaccess(v.typ, v.pointer(), k);
		if (e === 0) {
			return new Value.ptr(ptrType$1.nil, 0, 0);
		}
		typ = tt.elem;
		fl = ((((v.flag | key.flag) >>> 0)) & 32) >>> 0;
		fl = (fl | ((typ.Kind() >>> 0))) >>> 0;
		if (ifaceIndir(typ)) {
			c = unsafe_New(typ);
			memmove(c, e, typ.size);
			return new Value.ptr(typ, c, (fl | 64) >>> 0);
		} else {
			return new Value.ptr(typ, e.$get(), fl);
		}
	};
	Value.prototype.MapIndex = function(key) { return this.$val.MapIndex(key); };
	Value.ptr.prototype.MapKeys = function() {
		var a, c, fl, i, it, key, keyType, m, mlen, tt, v;
		v = this;
		new flag(v.flag).mustBe(21);
		tt = v.typ.kindType;
		keyType = tt.key;
		fl = (((v.flag & 32) >>> 0) | (keyType.Kind() >>> 0)) >>> 0;
		m = v.pointer();
		mlen = 0;
		if (!(m === 0)) {
			mlen = maplen(m);
		}
		it = mapiterinit(v.typ, m);
		a = $makeSlice(sliceType$6, mlen);
		i = 0;
		i = 0;
		while (true) {
			if (!(i < a.$length)) { break; }
			key = mapiterkey(it);
			if (key === 0) {
				break;
			}
			if (ifaceIndir(keyType)) {
				c = unsafe_New(keyType);
				memmove(c, key, keyType.size);
				(i < 0 || i >= a.$length) ? $throwRuntimeError("index out of range") : a.$array[a.$offset + i] = new Value.ptr(keyType, c, (fl | 64) >>> 0);
			} else {
				(i < 0 || i >= a.$length) ? $throwRuntimeError("index out of range") : a.$array[a.$offset + i] = new Value.ptr(keyType, key.$get(), fl);
			}
			mapiternext(it);
			i = i + (1) >> 0;
		}
		return $subslice(a, 0, i);
	};
	Value.prototype.MapKeys = function() { return this.$val.MapKeys(); };
	Value.ptr.prototype.Method = function(i) {
		var fl, i, v;
		v = this;
		if (v.typ === ptrType$1.nil) {
			$panic(new ValueError.ptr("reflect.Value.Method", 0));
		}
		if (!((((v.flag & 256) >>> 0) === 0)) || (i >>> 0) >= (v.typ.NumMethod() >>> 0)) {
			$panic(new $String("reflect: Method index out of range"));
		}
		if ((v.typ.Kind() === 20) && v.IsNil()) {
			$panic(new $String("reflect: Method on nil interface value"));
		}
		fl = (v.flag & 96) >>> 0;
		fl = (fl | (19)) >>> 0;
		fl = (fl | (((((i >>> 0) << 9 >>> 0) | 256) >>> 0))) >>> 0;
		return new Value.ptr(v.typ, v.ptr, fl);
	};
	Value.prototype.Method = function(i) { return this.$val.Method(i); };
	Value.ptr.prototype.NumMethod = function() {
		var v;
		v = this;
		if (v.typ === ptrType$1.nil) {
			$panic(new ValueError.ptr("reflect.Value.NumMethod", 0));
		}
		if (!((((v.flag & 256) >>> 0) === 0))) {
			return 0;
		}
		return v.typ.NumMethod();
	};
	Value.prototype.NumMethod = function() { return this.$val.NumMethod(); };
	Value.ptr.prototype.MethodByName = function(name) {
		var _tuple, m, name, ok, v;
		v = this;
		if (v.typ === ptrType$1.nil) {
			$panic(new ValueError.ptr("reflect.Value.MethodByName", 0));
		}
		if (!((((v.flag & 256) >>> 0) === 0))) {
			return new Value.ptr(ptrType$1.nil, 0, 0);
		}
		_tuple = v.typ.MethodByName(name); m = $clone(_tuple[0], Method); ok = _tuple[1];
		if (!ok) {
			return new Value.ptr(ptrType$1.nil, 0, 0);
		}
		return v.Method(m.Index);
	};
	Value.prototype.MethodByName = function(name) { return this.$val.MethodByName(name); };
	Value.ptr.prototype.NumField = function() {
		var tt, v;
		v = this;
		new flag(v.flag).mustBe(25);
		tt = v.typ.kindType;
		return tt.fields.$length;
	};
	Value.prototype.NumField = function() { return this.$val.NumField(); };
	Value.ptr.prototype.OverflowComplex = function(x) {
		var _ref, k, v, x;
		v = this;
		k = new flag(v.flag).kind();
		_ref = k;
		if (_ref === 15) {
			return overflowFloat32(x.$real) || overflowFloat32(x.$imag);
		} else if (_ref === 16) {
			return false;
		}
		$panic(new ValueError.ptr("reflect.Value.OverflowComplex", new flag(v.flag).kind()));
	};
	Value.prototype.OverflowComplex = function(x) { return this.$val.OverflowComplex(x); };
	Value.ptr.prototype.OverflowFloat = function(x) {
		var _ref, k, v, x;
		v = this;
		k = new flag(v.flag).kind();
		_ref = k;
		if (_ref === 13) {
			return overflowFloat32(x);
		} else if (_ref === 14) {
			return false;
		}
		$panic(new ValueError.ptr("reflect.Value.OverflowFloat", new flag(v.flag).kind()));
	};
	Value.prototype.OverflowFloat = function(x) { return this.$val.OverflowFloat(x); };
	overflowFloat32 = function(x) {
		var x;
		if (x < 0) {
			x = -x;
		}
		return 3.4028234663852886e+38 < x && x <= 1.7976931348623157e+308;
	};
	Value.ptr.prototype.OverflowInt = function(x) {
		var _ref, bitSize, k, trunc, v, x, x$1;
		v = this;
		k = new flag(v.flag).kind();
		_ref = k;
		if (_ref === 2 || _ref === 3 || _ref === 4 || _ref === 5 || _ref === 6) {
			bitSize = (x$1 = v.typ.size, (((x$1 >>> 16 << 16) * 8 >>> 0) + (x$1 << 16 >>> 16) * 8) >>> 0);
			trunc = $shiftRightInt64(($shiftLeft64(x, ((64 - bitSize >>> 0)))), ((64 - bitSize >>> 0)));
			return !((x.$high === trunc.$high && x.$low === trunc.$low));
		}
		$panic(new ValueError.ptr("reflect.Value.OverflowInt", new flag(v.flag).kind()));
	};
	Value.prototype.OverflowInt = function(x) { return this.$val.OverflowInt(x); };
	Value.ptr.prototype.OverflowUint = function(x) {
		var _ref, bitSize, k, trunc, v, x, x$1;
		v = this;
		k = new flag(v.flag).kind();
		_ref = k;
		if (_ref === 7 || _ref === 12 || _ref === 8 || _ref === 9 || _ref === 10 || _ref === 11) {
			bitSize = (x$1 = v.typ.size, (((x$1 >>> 16 << 16) * 8 >>> 0) + (x$1 << 16 >>> 16) * 8) >>> 0);
			trunc = $shiftRightUint64(($shiftLeft64(x, ((64 - bitSize >>> 0)))), ((64 - bitSize >>> 0)));
			return !((x.$high === trunc.$high && x.$low === trunc.$low));
		}
		$panic(new ValueError.ptr("reflect.Value.OverflowUint", new flag(v.flag).kind()));
	};
	Value.prototype.OverflowUint = function(x) { return this.$val.OverflowUint(x); };
	Value.ptr.prototype.SetBool = function(x) {
		var v, x;
		v = this;
		new flag(v.flag).mustBeAssignable();
		new flag(v.flag).mustBe(1);
		v.ptr.$set(x);
	};
	Value.prototype.SetBool = function(x) { return this.$val.SetBool(x); };
	Value.ptr.prototype.SetBytes = function(x) {
		var v, x;
		v = this;
		new flag(v.flag).mustBeAssignable();
		new flag(v.flag).mustBe(23);
		if (!((v.typ.Elem().Kind() === 8))) {
			$panic(new $String("reflect.Value.SetBytes of non-byte slice"));
		}
		v.ptr.$set(x);
	};
	Value.prototype.SetBytes = function(x) { return this.$val.SetBytes(x); };
	Value.ptr.prototype.setRunes = function(x) {
		var v, x;
		v = this;
		new flag(v.flag).mustBeAssignable();
		new flag(v.flag).mustBe(23);
		if (!((v.typ.Elem().Kind() === 5))) {
			$panic(new $String("reflect.Value.setRunes of non-rune slice"));
		}
		v.ptr.$set(x);
	};
	Value.prototype.setRunes = function(x) { return this.$val.setRunes(x); };
	Value.ptr.prototype.SetComplex = function(x) {
		var _ref, k, v, x;
		v = this;
		new flag(v.flag).mustBeAssignable();
		k = new flag(v.flag).kind();
		_ref = k;
		if (_ref === 15) {
			v.ptr.$set(new $Complex64(x.$real, x.$imag));
		} else if (_ref === 16) {
			v.ptr.$set(x);
		} else {
			$panic(new ValueError.ptr("reflect.Value.SetComplex", new flag(v.flag).kind()));
		}
	};
	Value.prototype.SetComplex = function(x) { return this.$val.SetComplex(x); };
	Value.ptr.prototype.SetFloat = function(x) {
		var _ref, k, v, x;
		v = this;
		new flag(v.flag).mustBeAssignable();
		k = new flag(v.flag).kind();
		_ref = k;
		if (_ref === 13) {
			v.ptr.$set(x);
		} else if (_ref === 14) {
			v.ptr.$set(x);
		} else {
			$panic(new ValueError.ptr("reflect.Value.SetFloat", new flag(v.flag).kind()));
		}
	};
	Value.prototype.SetFloat = function(x) { return this.$val.SetFloat(x); };
	Value.ptr.prototype.SetInt = function(x) {
		var _ref, k, v, x;
		v = this;
		new flag(v.flag).mustBeAssignable();
		k = new flag(v.flag).kind();
		_ref = k;
		if (_ref === 2) {
			v.ptr.$set(((x.$low + ((x.$high >> 31) * 4294967296)) >> 0));
		} else if (_ref === 3) {
			v.ptr.$set(((x.$low + ((x.$high >> 31) * 4294967296)) << 24 >> 24));
		} else if (_ref === 4) {
			v.ptr.$set(((x.$low + ((x.$high >> 31) * 4294967296)) << 16 >> 16));
		} else if (_ref === 5) {
			v.ptr.$set(((x.$low + ((x.$high >> 31) * 4294967296)) >> 0));
		} else if (_ref === 6) {
			v.ptr.$set(x);
		} else {
			$panic(new ValueError.ptr("reflect.Value.SetInt", new flag(v.flag).kind()));
		}
	};
	Value.prototype.SetInt = function(x) { return this.$val.SetInt(x); };
	Value.ptr.prototype.SetMapIndex = function(key, val) {
		var e, k, key, tt, v, val;
		v = this;
		val = val;
		key = key;
		new flag(v.flag).mustBe(21);
		new flag(v.flag).mustBeExported();
		new flag(key.flag).mustBeExported();
		tt = v.typ.kindType;
		key = key.assignTo("reflect.Value.SetMapIndex", tt.key, 0);
		k = 0;
		if (!((((key.flag & 64) >>> 0) === 0))) {
			k = key.ptr;
		} else {
			k = new ptrType$17(function() { return this.$target.ptr; }, function($v) { this.$target.ptr = $v; }, key);
		}
		if (val.typ === ptrType$1.nil) {
			mapdelete(v.typ, v.pointer(), k);
			return;
		}
		new flag(val.flag).mustBeExported();
		val = val.assignTo("reflect.Value.SetMapIndex", tt.elem, 0);
		e = 0;
		if (!((((val.flag & 64) >>> 0) === 0))) {
			e = val.ptr;
		} else {
			e = new ptrType$17(function() { return this.$target.ptr; }, function($v) { this.$target.ptr = $v; }, val);
		}
		mapassign(v.typ, v.pointer(), k, e);
	};
	Value.prototype.SetMapIndex = function(key, val) { return this.$val.SetMapIndex(key, val); };
	Value.ptr.prototype.SetUint = function(x) {
		var _ref, k, v, x;
		v = this;
		new flag(v.flag).mustBeAssignable();
		k = new flag(v.flag).kind();
		_ref = k;
		if (_ref === 7) {
			v.ptr.$set((x.$low >>> 0));
		} else if (_ref === 8) {
			v.ptr.$set((x.$low << 24 >>> 24));
		} else if (_ref === 9) {
			v.ptr.$set((x.$low << 16 >>> 16));
		} else if (_ref === 10) {
			v.ptr.$set((x.$low >>> 0));
		} else if (_ref === 11) {
			v.ptr.$set(x);
		} else if (_ref === 12) {
			v.ptr.$set((x.$low >>> 0));
		} else {
			$panic(new ValueError.ptr("reflect.Value.SetUint", new flag(v.flag).kind()));
		}
	};
	Value.prototype.SetUint = function(x) { return this.$val.SetUint(x); };
	Value.ptr.prototype.SetPointer = function(x) {
		var v, x;
		v = this;
		new flag(v.flag).mustBeAssignable();
		new flag(v.flag).mustBe(26);
		v.ptr.$set(x);
	};
	Value.prototype.SetPointer = function(x) { return this.$val.SetPointer(x); };
	Value.ptr.prototype.SetString = function(x) {
		var v, x;
		v = this;
		new flag(v.flag).mustBeAssignable();
		new flag(v.flag).mustBe(24);
		v.ptr.$set(x);
	};
	Value.prototype.SetString = function(x) { return this.$val.SetString(x); };
	Value.ptr.prototype.String = function() {
		var _ref, k, v;
		v = this;
		k = new flag(v.flag).kind();
		_ref = k;
		if (_ref === 0) {
			return "<invalid Value>";
		} else if (_ref === 24) {
			return v.ptr.$get();
		}
		return "<" + v.Type().String() + " Value>";
	};
	Value.prototype.String = function() { return this.$val.String(); };
	Value.ptr.prototype.Type = function() {
		var f, i, m, m$1, tt, ut, v, x, x$1;
		v = this;
		f = v.flag;
		if (f === 0) {
			$panic(new ValueError.ptr("reflect.Value.Type", 0));
		}
		if (((f & 256) >>> 0) === 0) {
			return v.typ;
		}
		i = (v.flag >> 0) >> 9 >> 0;
		if (v.typ.Kind() === 20) {
			tt = v.typ.kindType;
			if ((i >>> 0) >= (tt.methods.$length >>> 0)) {
				$panic(new $String("reflect: internal error: invalid method index"));
			}
			m = (x = tt.methods, ((i < 0 || i >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + i]));
			return m.typ;
		}
		ut = v.typ.uncommonType.uncommon();
		if (ut === ptrType$5.nil || (i >>> 0) >= (ut.methods.$length >>> 0)) {
			$panic(new $String("reflect: internal error: invalid method index"));
		}
		m$1 = (x$1 = ut.methods, ((i < 0 || i >= x$1.$length) ? $throwRuntimeError("index out of range") : x$1.$array[x$1.$offset + i]));
		return m$1.mtyp;
	};
	Value.prototype.Type = function() { return this.$val.Type(); };
	Value.ptr.prototype.Uint = function() {
		var _ref, k, p, v, x;
		v = this;
		k = new flag(v.flag).kind();
		p = v.ptr;
		_ref = k;
		if (_ref === 7) {
			return new $Uint64(0, p.$get());
		} else if (_ref === 8) {
			return new $Uint64(0, p.$get());
		} else if (_ref === 9) {
			return new $Uint64(0, p.$get());
		} else if (_ref === 10) {
			return new $Uint64(0, p.$get());
		} else if (_ref === 11) {
			return p.$get();
		} else if (_ref === 12) {
			return (x = p.$get(), new $Uint64(0, x.constructor === Number ? x : 1));
		}
		$panic(new ValueError.ptr("reflect.Value.Uint", new flag(v.flag).kind()));
	};
	Value.prototype.Uint = function() { return this.$val.Uint(); };
	Value.ptr.prototype.UnsafeAddr = function() {
		var v;
		v = this;
		if (v.typ === ptrType$1.nil) {
			$panic(new ValueError.ptr("reflect.Value.UnsafeAddr", 0));
		}
		if (((v.flag & 128) >>> 0) === 0) {
			$panic(new $String("reflect.Value.UnsafeAddr of unaddressable value"));
		}
		return v.ptr;
	};
	Value.prototype.UnsafeAddr = function() { return this.$val.UnsafeAddr(); };
	New = $pkg.New = function(typ) {
		var fl, ptr, typ;
		if ($interfaceIsEqual(typ, $ifaceNil)) {
			$panic(new $String("reflect: New(nil)"));
		}
		ptr = unsafe_New($assertType(typ, ptrType$1));
		fl = 22;
		return new Value.ptr(typ.common().ptrTo(), ptr, fl);
	};
	Value.ptr.prototype.assignTo = function(context, dst, target) {
		var context, dst, fl, target, v, x;
		v = this;
		if (!((((v.flag & 256) >>> 0) === 0))) {
			v = makeMethodValue(context, v);
		}
		if (directlyAssignable(dst, v.typ)) {
			v.typ = dst;
			fl = (v.flag & 224) >>> 0;
			fl = (fl | ((dst.Kind() >>> 0))) >>> 0;
			return new Value.ptr(dst, v.ptr, fl);
		} else if (implements$1(dst, v.typ)) {
			if (target === 0) {
				target = unsafe_New(dst);
			}
			x = valueInterface(v, false);
			if (dst.NumMethod() === 0) {
				target.$set(x);
			} else {
				ifaceE2I(dst, x, target);
			}
			return new Value.ptr(dst, target, 84);
		}
		$panic(new $String(context + ": value of type " + v.typ.String() + " is not assignable to type " + dst.String()));
	};
	Value.prototype.assignTo = function(context, dst, target) { return this.$val.assignTo(context, dst, target); };
	Value.ptr.prototype.Convert = function(t) {
		var op, t, v;
		v = this;
		if (!((((v.flag & 256) >>> 0) === 0))) {
			v = makeMethodValue("Convert", v);
		}
		op = convertOp(t.common(), v.typ);
		if (op === $throwNilPointerError) {
			$panic(new $String("reflect.Value.Convert: value of type " + v.typ.String() + " cannot be converted to type " + t.String()));
		}
		return op(v, t);
	};
	Value.prototype.Convert = function(t) { return this.$val.Convert(t); };
	convertOp = function(dst, src) {
		var _ref, _ref$1, _ref$2, _ref$3, _ref$4, _ref$5, _ref$6, dst, src;
		_ref = src.Kind();
		if (_ref === 2 || _ref === 3 || _ref === 4 || _ref === 5 || _ref === 6) {
			_ref$1 = dst.Kind();
			if (_ref$1 === 2 || _ref$1 === 3 || _ref$1 === 4 || _ref$1 === 5 || _ref$1 === 6 || _ref$1 === 7 || _ref$1 === 8 || _ref$1 === 9 || _ref$1 === 10 || _ref$1 === 11 || _ref$1 === 12) {
				return cvtInt;
			} else if (_ref$1 === 13 || _ref$1 === 14) {
				return cvtIntFloat;
			} else if (_ref$1 === 24) {
				return cvtIntString;
			}
		} else if (_ref === 7 || _ref === 8 || _ref === 9 || _ref === 10 || _ref === 11 || _ref === 12) {
			_ref$2 = dst.Kind();
			if (_ref$2 === 2 || _ref$2 === 3 || _ref$2 === 4 || _ref$2 === 5 || _ref$2 === 6 || _ref$2 === 7 || _ref$2 === 8 || _ref$2 === 9 || _ref$2 === 10 || _ref$2 === 11 || _ref$2 === 12) {
				return cvtUint;
			} else if (_ref$2 === 13 || _ref$2 === 14) {
				return cvtUintFloat;
			} else if (_ref$2 === 24) {
				return cvtUintString;
			}
		} else if (_ref === 13 || _ref === 14) {
			_ref$3 = dst.Kind();
			if (_ref$3 === 2 || _ref$3 === 3 || _ref$3 === 4 || _ref$3 === 5 || _ref$3 === 6) {
				return cvtFloatInt;
			} else if (_ref$3 === 7 || _ref$3 === 8 || _ref$3 === 9 || _ref$3 === 10 || _ref$3 === 11 || _ref$3 === 12) {
				return cvtFloatUint;
			} else if (_ref$3 === 13 || _ref$3 === 14) {
				return cvtFloat;
			}
		} else if (_ref === 15 || _ref === 16) {
			_ref$4 = dst.Kind();
			if (_ref$4 === 15 || _ref$4 === 16) {
				return cvtComplex;
			}
		} else if (_ref === 24) {
			if ((dst.Kind() === 23) && dst.Elem().PkgPath() === "") {
				_ref$5 = dst.Elem().Kind();
				if (_ref$5 === 8) {
					return cvtStringBytes;
				} else if (_ref$5 === 5) {
					return cvtStringRunes;
				}
			}
		} else if (_ref === 23) {
			if ((dst.Kind() === 24) && src.Elem().PkgPath() === "") {
				_ref$6 = src.Elem().Kind();
				if (_ref$6 === 8) {
					return cvtBytesString;
				} else if (_ref$6 === 5) {
					return cvtRunesString;
				}
			}
		}
		if (haveIdenticalUnderlyingType(dst, src)) {
			return cvtDirect;
		}
		if ((dst.Kind() === 22) && dst.Name() === "" && (src.Kind() === 22) && src.Name() === "" && haveIdenticalUnderlyingType(dst.Elem().common(), src.Elem().common())) {
			return cvtDirect;
		}
		if (implements$1(dst, src)) {
			if (src.Kind() === 20) {
				return cvtI2I;
			}
			return cvtT2I;
		}
		return $throwNilPointerError;
	};
	makeFloat = function(f, v, t) {
		var _ref, f, ptr, t, typ, v;
		typ = t.common();
		ptr = unsafe_New(typ);
		_ref = typ.size;
		if (_ref === 4) {
			ptr.$set(v);
		} else if (_ref === 8) {
			ptr.$set(v);
		}
		return new Value.ptr(typ, ptr, (((f | 64) >>> 0) | (typ.Kind() >>> 0)) >>> 0);
	};
	makeComplex = function(f, v, t) {
		var _ref, f, ptr, t, typ, v;
		typ = t.common();
		ptr = unsafe_New(typ);
		_ref = typ.size;
		if (_ref === 8) {
			ptr.$set(new $Complex64(v.$real, v.$imag));
		} else if (_ref === 16) {
			ptr.$set(v);
		}
		return new Value.ptr(typ, ptr, (((f | 64) >>> 0) | (typ.Kind() >>> 0)) >>> 0);
	};
	makeString = function(f, v, t) {
		var f, ret, t, v;
		ret = New(t).Elem();
		ret.SetString(v);
		ret.flag = ((ret.flag & ~128) | f) >>> 0;
		return ret;
	};
	makeBytes = function(f, v, t) {
		var f, ret, t, v;
		ret = New(t).Elem();
		ret.SetBytes(v);
		ret.flag = ((ret.flag & ~128) | f) >>> 0;
		return ret;
	};
	makeRunes = function(f, v, t) {
		var f, ret, t, v;
		ret = New(t).Elem();
		ret.setRunes(v);
		ret.flag = ((ret.flag & ~128) | f) >>> 0;
		return ret;
	};
	cvtInt = function(v, t) {
		var t, v, x;
		v = v;
		return makeInt((v.flag & 32) >>> 0, (x = v.Int(), new $Uint64(x.$high, x.$low)), t);
	};
	cvtUint = function(v, t) {
		var t, v;
		v = v;
		return makeInt((v.flag & 32) >>> 0, v.Uint(), t);
	};
	cvtFloatInt = function(v, t) {
		var t, v, x;
		v = v;
		return makeInt((v.flag & 32) >>> 0, (x = new $Int64(0, v.Float()), new $Uint64(x.$high, x.$low)), t);
	};
	cvtFloatUint = function(v, t) {
		var t, v;
		v = v;
		return makeInt((v.flag & 32) >>> 0, new $Uint64(0, v.Float()), t);
	};
	cvtIntFloat = function(v, t) {
		var t, v;
		v = v;
		return makeFloat((v.flag & 32) >>> 0, $flatten64(v.Int()), t);
	};
	cvtUintFloat = function(v, t) {
		var t, v;
		v = v;
		return makeFloat((v.flag & 32) >>> 0, $flatten64(v.Uint()), t);
	};
	cvtFloat = function(v, t) {
		var t, v;
		v = v;
		return makeFloat((v.flag & 32) >>> 0, v.Float(), t);
	};
	cvtComplex = function(v, t) {
		var t, v;
		v = v;
		return makeComplex((v.flag & 32) >>> 0, v.Complex(), t);
	};
	cvtIntString = function(v, t) {
		var t, v;
		v = v;
		return makeString((v.flag & 32) >>> 0, $encodeRune(v.Int().$low), t);
	};
	cvtUintString = function(v, t) {
		var t, v;
		v = v;
		return makeString((v.flag & 32) >>> 0, $encodeRune(v.Uint().$low), t);
	};
	cvtBytesString = function(v, t) {
		var t, v;
		v = v;
		return makeString((v.flag & 32) >>> 0, $bytesToString(v.Bytes()), t);
	};
	cvtStringBytes = function(v, t) {
		var t, v;
		v = v;
		return makeBytes((v.flag & 32) >>> 0, new sliceType$12($stringToBytes(v.String())), t);
	};
	cvtRunesString = function(v, t) {
		var t, v;
		v = v;
		return makeString((v.flag & 32) >>> 0, $runesToString(v.runes()), t);
	};
	cvtStringRunes = function(v, t) {
		var t, v;
		v = v;
		return makeRunes((v.flag & 32) >>> 0, new sliceType$13($stringToRunes(v.String())), t);
	};
	cvtT2I = function(v, typ) {
		var target, typ, v, x;
		v = v;
		target = unsafe_New(typ.common());
		x = valueInterface(v, false);
		if (typ.NumMethod() === 0) {
			target.$set(x);
		} else {
			ifaceE2I($assertType(typ, ptrType$1), x, target);
		}
		return new Value.ptr(typ.common(), target, (((((v.flag & 32) >>> 0) | 64) >>> 0) | 20) >>> 0);
	};
	cvtI2I = function(v, typ) {
		var ret, typ, v;
		v = v;
		if (v.IsNil()) {
			ret = Zero(typ);
			ret.flag = (ret.flag | (((v.flag & 32) >>> 0))) >>> 0;
			return ret;
		}
		return cvtT2I(v.Elem(), typ);
	};
	Kind.methods = [{prop: "String", name: "String", pkg: "", typ: $funcType([], [$String], false)}];
	ptrType$1.methods = [{prop: "ptrTo", name: "ptrTo", pkg: "reflect", typ: $funcType([], [ptrType$1], false)}, {prop: "pointers", name: "pointers", pkg: "reflect", typ: $funcType([], [$Bool], false)}, {prop: "Comparable", name: "Comparable", pkg: "", typ: $funcType([], [$Bool], false)}, {prop: "String", name: "String", pkg: "", typ: $funcType([], [$String], false)}, {prop: "Size", name: "Size", pkg: "", typ: $funcType([], [$Uintptr], false)}, {prop: "Bits", name: "Bits", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "Align", name: "Align", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "FieldAlign", name: "FieldAlign", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "Kind", name: "Kind", pkg: "", typ: $funcType([], [Kind], false)}, {prop: "common", name: "common", pkg: "reflect", typ: $funcType([], [ptrType$1], false)}, {prop: "NumMethod", name: "NumMethod", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "Method", name: "Method", pkg: "", typ: $funcType([$Int], [Method], false)}, {prop: "MethodByName", name: "MethodByName", pkg: "", typ: $funcType([$String], [Method, $Bool], false)}, {prop: "PkgPath", name: "PkgPath", pkg: "", typ: $funcType([], [$String], false)}, {prop: "Name", name: "Name", pkg: "", typ: $funcType([], [$String], false)}, {prop: "ChanDir", name: "ChanDir", pkg: "", typ: $funcType([], [ChanDir], false)}, {prop: "IsVariadic", name: "IsVariadic", pkg: "", typ: $funcType([], [$Bool], false)}, {prop: "Elem", name: "Elem", pkg: "", typ: $funcType([], [Type], false)}, {prop: "Field", name: "Field", pkg: "", typ: $funcType([$Int], [StructField], false)}, {prop: "FieldByIndex", name: "FieldByIndex", pkg: "", typ: $funcType([sliceType$9], [StructField], false)}, {prop: "FieldByName", name: "FieldByName", pkg: "", typ: $funcType([$String], [StructField, $Bool], false)}, {prop: "FieldByNameFunc", name: "FieldByNameFunc", pkg: "", typ: $funcType([funcType$2], [StructField, $Bool], false)}, {prop: "In", name: "In", pkg: "", typ: $funcType([$Int], [Type], false)}, {prop: "Key", name: "Key", pkg: "", typ: $funcType([], [Type], false)}, {prop: "Len", name: "Len", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "NumField", name: "NumField", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "NumIn", name: "NumIn", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "NumOut", name: "NumOut", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "Out", name: "Out", pkg: "", typ: $funcType([$Int], [Type], false)}, {prop: "Implements", name: "Implements", pkg: "", typ: $funcType([Type], [$Bool], false)}, {prop: "AssignableTo", name: "AssignableTo", pkg: "", typ: $funcType([Type], [$Bool], false)}, {prop: "ConvertibleTo", name: "ConvertibleTo", pkg: "", typ: $funcType([Type], [$Bool], false)}];
	ptrType$5.methods = [{prop: "Method", name: "Method", pkg: "", typ: $funcType([$Int], [Method], false)}, {prop: "uncommon", name: "uncommon", pkg: "reflect", typ: $funcType([], [ptrType$5], false)}, {prop: "PkgPath", name: "PkgPath", pkg: "", typ: $funcType([], [$String], false)}, {prop: "Name", name: "Name", pkg: "", typ: $funcType([], [$String], false)}, {prop: "NumMethod", name: "NumMethod", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "MethodByName", name: "MethodByName", pkg: "", typ: $funcType([$String], [Method, $Bool], false)}];
	ChanDir.methods = [{prop: "String", name: "String", pkg: "", typ: $funcType([], [$String], false)}];
	ptrType$10.methods = [{prop: "Method", name: "Method", pkg: "", typ: $funcType([$Int], [Method], false)}, {prop: "NumMethod", name: "NumMethod", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "MethodByName", name: "MethodByName", pkg: "", typ: $funcType([$String], [Method, $Bool], false)}];
	ptrType$12.methods = [{prop: "Field", name: "Field", pkg: "", typ: $funcType([$Int], [StructField], false)}, {prop: "FieldByIndex", name: "FieldByIndex", pkg: "", typ: $funcType([sliceType$9], [StructField], false)}, {prop: "FieldByNameFunc", name: "FieldByNameFunc", pkg: "", typ: $funcType([funcType$2], [StructField, $Bool], false)}, {prop: "FieldByName", name: "FieldByName", pkg: "", typ: $funcType([$String], [StructField, $Bool], false)}];
	StructTag.methods = [{prop: "Get", name: "Get", pkg: "", typ: $funcType([$String], [$String], false)}];
	Value.methods = [{prop: "object", name: "object", pkg: "reflect", typ: $funcType([], [js.Object], false)}, {prop: "call", name: "call", pkg: "reflect", typ: $funcType([$String, sliceType$6], [sliceType$6], false)}, {prop: "Cap", name: "Cap", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "Elem", name: "Elem", pkg: "", typ: $funcType([], [Value], false)}, {prop: "Field", name: "Field", pkg: "", typ: $funcType([$Int], [Value], false)}, {prop: "Index", name: "Index", pkg: "", typ: $funcType([$Int], [Value], false)}, {prop: "IsNil", name: "IsNil", pkg: "", typ: $funcType([], [$Bool], false)}, {prop: "Len", name: "Len", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "Pointer", name: "Pointer", pkg: "", typ: $funcType([], [$Uintptr], false)}, {prop: "Set", name: "Set", pkg: "", typ: $funcType([Value], [], false)}, {prop: "SetCap", name: "SetCap", pkg: "", typ: $funcType([$Int], [], false)}, {prop: "SetLen", name: "SetLen", pkg: "", typ: $funcType([$Int], [], false)}, {prop: "Slice", name: "Slice", pkg: "", typ: $funcType([$Int, $Int], [Value], false)}, {prop: "Slice3", name: "Slice3", pkg: "", typ: $funcType([$Int, $Int, $Int], [Value], false)}, {prop: "Close", name: "Close", pkg: "", typ: $funcType([], [], false)}, {prop: "TrySend", name: "TrySend", pkg: "", typ: $funcType([Value], [$Bool], false)}, {prop: "Send", name: "Send", pkg: "", typ: $funcType([Value], [], false)}, {prop: "TryRecv", name: "TryRecv", pkg: "", typ: $funcType([], [Value, $Bool], false)}, {prop: "Recv", name: "Recv", pkg: "", typ: $funcType([], [Value, $Bool], false)}, {prop: "pointer", name: "pointer", pkg: "reflect", typ: $funcType([], [$UnsafePointer], false)}, {prop: "Addr", name: "Addr", pkg: "", typ: $funcType([], [Value], false)}, {prop: "Bool", name: "Bool", pkg: "", typ: $funcType([], [$Bool], false)}, {prop: "Bytes", name: "Bytes", pkg: "", typ: $funcType([], [sliceType$12], false)}, {prop: "runes", name: "runes", pkg: "reflect", typ: $funcType([], [sliceType$13], false)}, {prop: "CanAddr", name: "CanAddr", pkg: "", typ: $funcType([], [$Bool], false)}, {prop: "CanSet", name: "CanSet", pkg: "", typ: $funcType([], [$Bool], false)}, {prop: "Call", name: "Call", pkg: "", typ: $funcType([sliceType$6], [sliceType$6], false)}, {prop: "CallSlice", name: "CallSlice", pkg: "", typ: $funcType([sliceType$6], [sliceType$6], false)}, {prop: "Complex", name: "Complex", pkg: "", typ: $funcType([], [$Complex128], false)}, {prop: "FieldByIndex", name: "FieldByIndex", pkg: "", typ: $funcType([sliceType$9], [Value], false)}, {prop: "FieldByName", name: "FieldByName", pkg: "", typ: $funcType([$String], [Value], false)}, {prop: "FieldByNameFunc", name: "FieldByNameFunc", pkg: "", typ: $funcType([funcType$2], [Value], false)}, {prop: "Float", name: "Float", pkg: "", typ: $funcType([], [$Float64], false)}, {prop: "Int", name: "Int", pkg: "", typ: $funcType([], [$Int64], false)}, {prop: "CanInterface", name: "CanInterface", pkg: "", typ: $funcType([], [$Bool], false)}, {prop: "Interface", name: "Interface", pkg: "", typ: $funcType([], [$emptyInterface], false)}, {prop: "InterfaceData", name: "InterfaceData", pkg: "", typ: $funcType([], [arrayType$3], false)}, {prop: "IsValid", name: "IsValid", pkg: "", typ: $funcType([], [$Bool], false)}, {prop: "Kind", name: "Kind", pkg: "", typ: $funcType([], [Kind], false)}, {prop: "MapIndex", name: "MapIndex", pkg: "", typ: $funcType([Value], [Value], false)}, {prop: "MapKeys", name: "MapKeys", pkg: "", typ: $funcType([], [sliceType$6], false)}, {prop: "Method", name: "Method", pkg: "", typ: $funcType([$Int], [Value], false)}, {prop: "NumMethod", name: "NumMethod", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "MethodByName", name: "MethodByName", pkg: "", typ: $funcType([$String], [Value], false)}, {prop: "NumField", name: "NumField", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "OverflowComplex", name: "OverflowComplex", pkg: "", typ: $funcType([$Complex128], [$Bool], false)}, {prop: "OverflowFloat", name: "OverflowFloat", pkg: "", typ: $funcType([$Float64], [$Bool], false)}, {prop: "OverflowInt", name: "OverflowInt", pkg: "", typ: $funcType([$Int64], [$Bool], false)}, {prop: "OverflowUint", name: "OverflowUint", pkg: "", typ: $funcType([$Uint64], [$Bool], false)}, {prop: "recv", name: "recv", pkg: "reflect", typ: $funcType([$Bool], [Value, $Bool], false)}, {prop: "send", name: "send", pkg: "reflect", typ: $funcType([Value, $Bool], [$Bool], false)}, {prop: "SetBool", name: "SetBool", pkg: "", typ: $funcType([$Bool], [], false)}, {prop: "SetBytes", name: "SetBytes", pkg: "", typ: $funcType([sliceType$12], [], false)}, {prop: "setRunes", name: "setRunes", pkg: "reflect", typ: $funcType([sliceType$13], [], false)}, {prop: "SetComplex", name: "SetComplex", pkg: "", typ: $funcType([$Complex128], [], false)}, {prop: "SetFloat", name: "SetFloat", pkg: "", typ: $funcType([$Float64], [], false)}, {prop: "SetInt", name: "SetInt", pkg: "", typ: $funcType([$Int64], [], false)}, {prop: "SetMapIndex", name: "SetMapIndex", pkg: "", typ: $funcType([Value, Value], [], false)}, {prop: "SetUint", name: "SetUint", pkg: "", typ: $funcType([$Uint64], [], false)}, {prop: "SetPointer", name: "SetPointer", pkg: "", typ: $funcType([$UnsafePointer], [], false)}, {prop: "SetString", name: "SetString", pkg: "", typ: $funcType([$String], [], false)}, {prop: "String", name: "String", pkg: "", typ: $funcType([], [$String], false)}, {prop: "Type", name: "Type", pkg: "", typ: $funcType([], [Type], false)}, {prop: "Uint", name: "Uint", pkg: "", typ: $funcType([], [$Uint64], false)}, {prop: "UnsafeAddr", name: "UnsafeAddr", pkg: "", typ: $funcType([], [$Uintptr], false)}, {prop: "assignTo", name: "assignTo", pkg: "reflect", typ: $funcType([$String, ptrType$1, $UnsafePointer], [Value], false)}, {prop: "Convert", name: "Convert", pkg: "", typ: $funcType([Type], [Value], false)}];
	flag.methods = [{prop: "kind", name: "kind", pkg: "reflect", typ: $funcType([], [Kind], false)}, {prop: "mustBe", name: "mustBe", pkg: "reflect", typ: $funcType([Kind], [], false)}, {prop: "mustBeExported", name: "mustBeExported", pkg: "reflect", typ: $funcType([], [], false)}, {prop: "mustBeAssignable", name: "mustBeAssignable", pkg: "reflect", typ: $funcType([], [], false)}];
	ptrType$20.methods = [{prop: "Error", name: "Error", pkg: "", typ: $funcType([], [$String], false)}];
	mapIter.init([{prop: "t", name: "t", pkg: "reflect", typ: Type, tag: ""}, {prop: "m", name: "m", pkg: "reflect", typ: js.Object, tag: ""}, {prop: "keys", name: "keys", pkg: "reflect", typ: js.Object, tag: ""}, {prop: "i", name: "i", pkg: "reflect", typ: $Int, tag: ""}]);
	Type.init([{prop: "Align", name: "Align", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "AssignableTo", name: "AssignableTo", pkg: "", typ: $funcType([Type], [$Bool], false)}, {prop: "Bits", name: "Bits", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "ChanDir", name: "ChanDir", pkg: "", typ: $funcType([], [ChanDir], false)}, {prop: "Comparable", name: "Comparable", pkg: "", typ: $funcType([], [$Bool], false)}, {prop: "ConvertibleTo", name: "ConvertibleTo", pkg: "", typ: $funcType([Type], [$Bool], false)}, {prop: "Elem", name: "Elem", pkg: "", typ: $funcType([], [Type], false)}, {prop: "Field", name: "Field", pkg: "", typ: $funcType([$Int], [StructField], false)}, {prop: "FieldAlign", name: "FieldAlign", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "FieldByIndex", name: "FieldByIndex", pkg: "", typ: $funcType([sliceType$9], [StructField], false)}, {prop: "FieldByName", name: "FieldByName", pkg: "", typ: $funcType([$String], [StructField, $Bool], false)}, {prop: "FieldByNameFunc", name: "FieldByNameFunc", pkg: "", typ: $funcType([funcType$2], [StructField, $Bool], false)}, {prop: "Implements", name: "Implements", pkg: "", typ: $funcType([Type], [$Bool], false)}, {prop: "In", name: "In", pkg: "", typ: $funcType([$Int], [Type], false)}, {prop: "IsVariadic", name: "IsVariadic", pkg: "", typ: $funcType([], [$Bool], false)}, {prop: "Key", name: "Key", pkg: "", typ: $funcType([], [Type], false)}, {prop: "Kind", name: "Kind", pkg: "", typ: $funcType([], [Kind], false)}, {prop: "Len", name: "Len", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "Method", name: "Method", pkg: "", typ: $funcType([$Int], [Method], false)}, {prop: "MethodByName", name: "MethodByName", pkg: "", typ: $funcType([$String], [Method, $Bool], false)}, {prop: "Name", name: "Name", pkg: "", typ: $funcType([], [$String], false)}, {prop: "NumField", name: "NumField", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "NumIn", name: "NumIn", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "NumMethod", name: "NumMethod", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "NumOut", name: "NumOut", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "Out", name: "Out", pkg: "", typ: $funcType([$Int], [Type], false)}, {prop: "PkgPath", name: "PkgPath", pkg: "", typ: $funcType([], [$String], false)}, {prop: "Size", name: "Size", pkg: "", typ: $funcType([], [$Uintptr], false)}, {prop: "String", name: "String", pkg: "", typ: $funcType([], [$String], false)}, {prop: "common", name: "common", pkg: "reflect", typ: $funcType([], [ptrType$1], false)}, {prop: "uncommon", name: "uncommon", pkg: "reflect", typ: $funcType([], [ptrType$5], false)}]);
	rtype.init([{prop: "size", name: "size", pkg: "reflect", typ: $Uintptr, tag: ""}, {prop: "hash", name: "hash", pkg: "reflect", typ: $Uint32, tag: ""}, {prop: "_$2", name: "_", pkg: "reflect", typ: $Uint8, tag: ""}, {prop: "align", name: "align", pkg: "reflect", typ: $Uint8, tag: ""}, {prop: "fieldAlign", name: "fieldAlign", pkg: "reflect", typ: $Uint8, tag: ""}, {prop: "kind", name: "kind", pkg: "reflect", typ: $Uint8, tag: ""}, {prop: "alg", name: "alg", pkg: "reflect", typ: ptrType$3, tag: ""}, {prop: "gc", name: "gc", pkg: "reflect", typ: arrayType$1, tag: ""}, {prop: "string", name: "string", pkg: "reflect", typ: ptrType$4, tag: ""}, {prop: "uncommonType", name: "", pkg: "reflect", typ: ptrType$5, tag: ""}, {prop: "ptrToThis", name: "ptrToThis", pkg: "reflect", typ: ptrType$1, tag: ""}, {prop: "zero", name: "zero", pkg: "reflect", typ: $UnsafePointer, tag: ""}]);
	typeAlg.init([{prop: "hash", name: "hash", pkg: "reflect", typ: funcType$3, tag: ""}, {prop: "equal", name: "equal", pkg: "reflect", typ: funcType$4, tag: ""}]);
	method.init([{prop: "name", name: "name", pkg: "reflect", typ: ptrType$4, tag: ""}, {prop: "pkgPath", name: "pkgPath", pkg: "reflect", typ: ptrType$4, tag: ""}, {prop: "mtyp", name: "mtyp", pkg: "reflect", typ: ptrType$1, tag: ""}, {prop: "typ", name: "typ", pkg: "reflect", typ: ptrType$1, tag: ""}, {prop: "ifn", name: "ifn", pkg: "reflect", typ: $UnsafePointer, tag: ""}, {prop: "tfn", name: "tfn", pkg: "reflect", typ: $UnsafePointer, tag: ""}]);
	uncommonType.init([{prop: "name", name: "name", pkg: "reflect", typ: ptrType$4, tag: ""}, {prop: "pkgPath", name: "pkgPath", pkg: "reflect", typ: ptrType$4, tag: ""}, {prop: "methods", name: "methods", pkg: "reflect", typ: sliceType$2, tag: ""}]);
	arrayType.init([{prop: "rtype", name: "", pkg: "reflect", typ: rtype, tag: "reflect:\"array\""}, {prop: "elem", name: "elem", pkg: "reflect", typ: ptrType$1, tag: ""}, {prop: "slice", name: "slice", pkg: "reflect", typ: ptrType$1, tag: ""}, {prop: "len", name: "len", pkg: "reflect", typ: $Uintptr, tag: ""}]);
	chanType.init([{prop: "rtype", name: "", pkg: "reflect", typ: rtype, tag: "reflect:\"chan\""}, {prop: "elem", name: "elem", pkg: "reflect", typ: ptrType$1, tag: ""}, {prop: "dir", name: "dir", pkg: "reflect", typ: $Uintptr, tag: ""}]);
	funcType.init([{prop: "rtype", name: "", pkg: "reflect", typ: rtype, tag: "reflect:\"func\""}, {prop: "dotdotdot", name: "dotdotdot", pkg: "reflect", typ: $Bool, tag: ""}, {prop: "in$2", name: "in", pkg: "reflect", typ: sliceType$3, tag: ""}, {prop: "out", name: "out", pkg: "reflect", typ: sliceType$3, tag: ""}]);
	imethod.init([{prop: "name", name: "name", pkg: "reflect", typ: ptrType$4, tag: ""}, {prop: "pkgPath", name: "pkgPath", pkg: "reflect", typ: ptrType$4, tag: ""}, {prop: "typ", name: "typ", pkg: "reflect", typ: ptrType$1, tag: ""}]);
	interfaceType.init([{prop: "rtype", name: "", pkg: "reflect", typ: rtype, tag: "reflect:\"interface\""}, {prop: "methods", name: "methods", pkg: "reflect", typ: sliceType$4, tag: ""}]);
	mapType.init([{prop: "rtype", name: "", pkg: "reflect", typ: rtype, tag: "reflect:\"map\""}, {prop: "key", name: "key", pkg: "reflect", typ: ptrType$1, tag: ""}, {prop: "elem", name: "elem", pkg: "reflect", typ: ptrType$1, tag: ""}, {prop: "bucket", name: "bucket", pkg: "reflect", typ: ptrType$1, tag: ""}, {prop: "hmap", name: "hmap", pkg: "reflect", typ: ptrType$1, tag: ""}, {prop: "keysize", name: "keysize", pkg: "reflect", typ: $Uint8, tag: ""}, {prop: "indirectkey", name: "indirectkey", pkg: "reflect", typ: $Uint8, tag: ""}, {prop: "valuesize", name: "valuesize", pkg: "reflect", typ: $Uint8, tag: ""}, {prop: "indirectvalue", name: "indirectvalue", pkg: "reflect", typ: $Uint8, tag: ""}, {prop: "bucketsize", name: "bucketsize", pkg: "reflect", typ: $Uint16, tag: ""}]);
	ptrType.init([{prop: "rtype", name: "", pkg: "reflect", typ: rtype, tag: "reflect:\"ptr\""}, {prop: "elem", name: "elem", pkg: "reflect", typ: ptrType$1, tag: ""}]);
	sliceType.init([{prop: "rtype", name: "", pkg: "reflect", typ: rtype, tag: "reflect:\"slice\""}, {prop: "elem", name: "elem", pkg: "reflect", typ: ptrType$1, tag: ""}]);
	structField.init([{prop: "name", name: "name", pkg: "reflect", typ: ptrType$4, tag: ""}, {prop: "pkgPath", name: "pkgPath", pkg: "reflect", typ: ptrType$4, tag: ""}, {prop: "typ", name: "typ", pkg: "reflect", typ: ptrType$1, tag: ""}, {prop: "tag", name: "tag", pkg: "reflect", typ: ptrType$4, tag: ""}, {prop: "offset", name: "offset", pkg: "reflect", typ: $Uintptr, tag: ""}]);
	structType.init([{prop: "rtype", name: "", pkg: "reflect", typ: rtype, tag: "reflect:\"struct\""}, {prop: "fields", name: "fields", pkg: "reflect", typ: sliceType$5, tag: ""}]);
	Method.init([{prop: "Name", name: "Name", pkg: "", typ: $String, tag: ""}, {prop: "PkgPath", name: "PkgPath", pkg: "", typ: $String, tag: ""}, {prop: "Type", name: "Type", pkg: "", typ: Type, tag: ""}, {prop: "Func", name: "Func", pkg: "", typ: Value, tag: ""}, {prop: "Index", name: "Index", pkg: "", typ: $Int, tag: ""}]);
	StructField.init([{prop: "Name", name: "Name", pkg: "", typ: $String, tag: ""}, {prop: "PkgPath", name: "PkgPath", pkg: "", typ: $String, tag: ""}, {prop: "Type", name: "Type", pkg: "", typ: Type, tag: ""}, {prop: "Tag", name: "Tag", pkg: "", typ: StructTag, tag: ""}, {prop: "Offset", name: "Offset", pkg: "", typ: $Uintptr, tag: ""}, {prop: "Index", name: "Index", pkg: "", typ: sliceType$9, tag: ""}, {prop: "Anonymous", name: "Anonymous", pkg: "", typ: $Bool, tag: ""}]);
	fieldScan.init([{prop: "typ", name: "typ", pkg: "reflect", typ: ptrType$12, tag: ""}, {prop: "index", name: "index", pkg: "reflect", typ: sliceType$9, tag: ""}]);
	Value.init([{prop: "typ", name: "typ", pkg: "reflect", typ: ptrType$1, tag: ""}, {prop: "ptr", name: "ptr", pkg: "reflect", typ: $UnsafePointer, tag: ""}, {prop: "flag", name: "", pkg: "reflect", typ: flag, tag: ""}]);
	ValueError.init([{prop: "Method", name: "Method", pkg: "", typ: $String, tag: ""}, {prop: "Kind", name: "Kind", pkg: "", typ: Kind, tag: ""}]);
	nonEmptyInterface.init([{prop: "itab", name: "itab", pkg: "reflect", typ: ptrType$7, tag: ""}, {prop: "word", name: "word", pkg: "reflect", typ: $UnsafePointer, tag: ""}]);
	$pkg.$init = function() {
		$pkg.$init = function() {};
		/* */ var $r, $s = 0; var $init_reflect = function() { while (true) { switch ($s) { case 0:
		$r = js.$init($BLOCKING); /* */ $s = 1; case 1: if ($r && $r.$blocking) { $r = $r(); }
		$r = math.$init($BLOCKING); /* */ $s = 2; case 2: if ($r && $r.$blocking) { $r = $r(); }
		$r = runtime.$init($BLOCKING); /* */ $s = 3; case 3: if ($r && $r.$blocking) { $r = $r(); }
		$r = strconv.$init($BLOCKING); /* */ $s = 4; case 4: if ($r && $r.$blocking) { $r = $r(); }
		$r = sync.$init($BLOCKING); /* */ $s = 5; case 5: if ($r && $r.$blocking) { $r = $r(); }
		initialized = false;
		stringPtrMap = new $Map();
		jsObject = $js.Object;
		jsContainer = $js.container.ptr;
		kindNames = new sliceType$1(["invalid", "bool", "int", "int8", "int16", "int32", "int64", "uint", "uint8", "uint16", "uint32", "uint64", "uintptr", "float32", "float64", "complex64", "complex128", "array", "chan", "func", "interface", "map", "ptr", "slice", "string", "struct", "unsafe.Pointer"]);
		uint8Type = $assertType(TypeOf(new $Uint8(0)), ptrType$1);
		init();
		/* */ } return; } }; $init_reflect.$blocking = true; return $init_reflect;
	};
	return $pkg;
})();
$packages["fmt"] = (function() {
	var $pkg = {}, errors, io, math, os, reflect, strconv, sync, utf8, fmtFlags, fmt, State, Formatter, Stringer, GoStringer, buffer, pp, runeUnreader, scanError, ss, ssave, sliceType, sliceType$1, arrayType, sliceType$2, ptrType, ptrType$1, ptrType$2, ptrType$5, arrayType$1, arrayType$2, ptrType$25, funcType, padZeroBytes, padSpaceBytes, trueBytes, falseBytes, commaSpaceBytes, nilAngleBytes, nilParenBytes, nilBytes, mapBytes, percentBangBytes, panicBytes, irparenBytes, bytesBytes, ppFree, intBits, uintptrBits, byteType, space, ssFree, complexError, boolError, init, doPrec, newPrinter, Fprintln, Println, getField, isSpace, notSpace, indexRune;
	errors = $packages["errors"];
	io = $packages["io"];
	math = $packages["math"];
	os = $packages["os"];
	reflect = $packages["reflect"];
	strconv = $packages["strconv"];
	sync = $packages["sync"];
	utf8 = $packages["unicode/utf8"];
	fmtFlags = $pkg.fmtFlags = $newType(0, $kindStruct, "fmt.fmtFlags", "fmtFlags", "fmt", function(widPresent_, precPresent_, minus_, plus_, sharp_, space_, unicode_, uniQuote_, zero_, plusV_, sharpV_) {
		this.$val = this;
		this.widPresent = widPresent_ !== undefined ? widPresent_ : false;
		this.precPresent = precPresent_ !== undefined ? precPresent_ : false;
		this.minus = minus_ !== undefined ? minus_ : false;
		this.plus = plus_ !== undefined ? plus_ : false;
		this.sharp = sharp_ !== undefined ? sharp_ : false;
		this.space = space_ !== undefined ? space_ : false;
		this.unicode = unicode_ !== undefined ? unicode_ : false;
		this.uniQuote = uniQuote_ !== undefined ? uniQuote_ : false;
		this.zero = zero_ !== undefined ? zero_ : false;
		this.plusV = plusV_ !== undefined ? plusV_ : false;
		this.sharpV = sharpV_ !== undefined ? sharpV_ : false;
	});
	fmt = $pkg.fmt = $newType(0, $kindStruct, "fmt.fmt", "fmt", "fmt", function(intbuf_, buf_, wid_, prec_, fmtFlags_) {
		this.$val = this;
		this.intbuf = intbuf_ !== undefined ? intbuf_ : arrayType$2.zero();
		this.buf = buf_ !== undefined ? buf_ : ptrType$1.nil;
		this.wid = wid_ !== undefined ? wid_ : 0;
		this.prec = prec_ !== undefined ? prec_ : 0;
		this.fmtFlags = fmtFlags_ !== undefined ? fmtFlags_ : new fmtFlags.ptr();
	});
	State = $pkg.State = $newType(8, $kindInterface, "fmt.State", "State", "fmt", null);
	Formatter = $pkg.Formatter = $newType(8, $kindInterface, "fmt.Formatter", "Formatter", "fmt", null);
	Stringer = $pkg.Stringer = $newType(8, $kindInterface, "fmt.Stringer", "Stringer", "fmt", null);
	GoStringer = $pkg.GoStringer = $newType(8, $kindInterface, "fmt.GoStringer", "GoStringer", "fmt", null);
	buffer = $pkg.buffer = $newType(12, $kindSlice, "fmt.buffer", "buffer", "fmt", null);
	pp = $pkg.pp = $newType(0, $kindStruct, "fmt.pp", "pp", "fmt", function(n_, panicking_, erroring_, buf_, arg_, value_, reordered_, goodArgNum_, runeBuf_, fmt_) {
		this.$val = this;
		this.n = n_ !== undefined ? n_ : 0;
		this.panicking = panicking_ !== undefined ? panicking_ : false;
		this.erroring = erroring_ !== undefined ? erroring_ : false;
		this.buf = buf_ !== undefined ? buf_ : buffer.nil;
		this.arg = arg_ !== undefined ? arg_ : $ifaceNil;
		this.value = value_ !== undefined ? value_ : new reflect.Value.ptr();
		this.reordered = reordered_ !== undefined ? reordered_ : false;
		this.goodArgNum = goodArgNum_ !== undefined ? goodArgNum_ : false;
		this.runeBuf = runeBuf_ !== undefined ? runeBuf_ : arrayType$1.zero();
		this.fmt = fmt_ !== undefined ? fmt_ : new fmt.ptr();
	});
	runeUnreader = $pkg.runeUnreader = $newType(8, $kindInterface, "fmt.runeUnreader", "runeUnreader", "fmt", null);
	scanError = $pkg.scanError = $newType(0, $kindStruct, "fmt.scanError", "scanError", "fmt", function(err_) {
		this.$val = this;
		this.err = err_ !== undefined ? err_ : $ifaceNil;
	});
	ss = $pkg.ss = $newType(0, $kindStruct, "fmt.ss", "ss", "fmt", function(rr_, buf_, peekRune_, prevRune_, count_, atEOF_, ssave_) {
		this.$val = this;
		this.rr = rr_ !== undefined ? rr_ : $ifaceNil;
		this.buf = buf_ !== undefined ? buf_ : buffer.nil;
		this.peekRune = peekRune_ !== undefined ? peekRune_ : 0;
		this.prevRune = prevRune_ !== undefined ? prevRune_ : 0;
		this.count = count_ !== undefined ? count_ : 0;
		this.atEOF = atEOF_ !== undefined ? atEOF_ : false;
		this.ssave = ssave_ !== undefined ? ssave_ : new ssave.ptr();
	});
	ssave = $pkg.ssave = $newType(0, $kindStruct, "fmt.ssave", "ssave", "fmt", function(validSave_, nlIsEnd_, nlIsSpace_, argLimit_, limit_, maxWid_) {
		this.$val = this;
		this.validSave = validSave_ !== undefined ? validSave_ : false;
		this.nlIsEnd = nlIsEnd_ !== undefined ? nlIsEnd_ : false;
		this.nlIsSpace = nlIsSpace_ !== undefined ? nlIsSpace_ : false;
		this.argLimit = argLimit_ !== undefined ? argLimit_ : 0;
		this.limit = limit_ !== undefined ? limit_ : 0;
		this.maxWid = maxWid_ !== undefined ? maxWid_ : 0;
	});
	sliceType = $sliceType($Uint8);
	sliceType$1 = $sliceType($emptyInterface);
	arrayType = $arrayType($Uint16, 2);
	sliceType$2 = $sliceType(arrayType);
	ptrType = $ptrType(pp);
	ptrType$1 = $ptrType(buffer);
	ptrType$2 = $ptrType(reflect.rtype);
	ptrType$5 = $ptrType(ss);
	arrayType$1 = $arrayType($Uint8, 4);
	arrayType$2 = $arrayType($Uint8, 65);
	ptrType$25 = $ptrType(fmt);
	funcType = $funcType([$Int32], [$Bool], false);
	init = function() {
		var i;
		i = 0;
		while (true) {
			if (!(i < 65)) { break; }
			(i < 0 || i >= padZeroBytes.$length) ? $throwRuntimeError("index out of range") : padZeroBytes.$array[padZeroBytes.$offset + i] = 48;
			(i < 0 || i >= padSpaceBytes.$length) ? $throwRuntimeError("index out of range") : padSpaceBytes.$array[padSpaceBytes.$offset + i] = 32;
			i = i + (1) >> 0;
		}
	};
	fmt.ptr.prototype.clearflags = function() {
		var f;
		f = this;
		$copy(f.fmtFlags, new fmtFlags.ptr(false, false, false, false, false, false, false, false, false, false, false), fmtFlags);
	};
	fmt.prototype.clearflags = function() { return this.$val.clearflags(); };
	fmt.ptr.prototype.init = function(buf) {
		var buf, f;
		f = this;
		f.buf = buf;
		f.clearflags();
	};
	fmt.prototype.init = function(buf) { return this.$val.init(buf); };
	fmt.ptr.prototype.computePadding = function(width) {
		var _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, _tmp$6, _tmp$7, _tmp$8, f, left, leftWidth = 0, padding = sliceType.nil, rightWidth = 0, w, width;
		f = this;
		left = !f.fmtFlags.minus;
		w = f.wid;
		if (w < 0) {
			left = false;
			w = -w;
		}
		w = w - (width) >> 0;
		if (w > 0) {
			if (left && f.fmtFlags.zero) {
				_tmp = padZeroBytes; _tmp$1 = w; _tmp$2 = 0; padding = _tmp; leftWidth = _tmp$1; rightWidth = _tmp$2;
				return [padding, leftWidth, rightWidth];
			}
			if (left) {
				_tmp$3 = padSpaceBytes; _tmp$4 = w; _tmp$5 = 0; padding = _tmp$3; leftWidth = _tmp$4; rightWidth = _tmp$5;
				return [padding, leftWidth, rightWidth];
			} else {
				_tmp$6 = padSpaceBytes; _tmp$7 = 0; _tmp$8 = w; padding = _tmp$6; leftWidth = _tmp$7; rightWidth = _tmp$8;
				return [padding, leftWidth, rightWidth];
			}
		}
		return [padding, leftWidth, rightWidth];
	};
	fmt.prototype.computePadding = function(width) { return this.$val.computePadding(width); };
	fmt.ptr.prototype.writePadding = function(n, padding) {
		var f, m, n, padding;
		f = this;
		while (true) {
			if (!(n > 0)) { break; }
			m = n;
			if (m > 65) {
				m = 65;
			}
			f.buf.Write($subslice(padding, 0, m));
			n = n - (m) >> 0;
		}
	};
	fmt.prototype.writePadding = function(n, padding) { return this.$val.writePadding(n, padding); };
	fmt.ptr.prototype.pad = function(b) {
		var _tuple, b, f, left, padding, right;
		f = this;
		if (!f.fmtFlags.widPresent || (f.wid === 0)) {
			f.buf.Write(b);
			return;
		}
		_tuple = f.computePadding(utf8.RuneCount(b)); padding = _tuple[0]; left = _tuple[1]; right = _tuple[2];
		if (left > 0) {
			f.writePadding(left, padding);
		}
		f.buf.Write(b);
		if (right > 0) {
			f.writePadding(right, padding);
		}
	};
	fmt.prototype.pad = function(b) { return this.$val.pad(b); };
	fmt.ptr.prototype.padString = function(s) {
		var _tuple, f, left, padding, right, s;
		f = this;
		if (!f.fmtFlags.widPresent || (f.wid === 0)) {
			f.buf.WriteString(s);
			return;
		}
		_tuple = f.computePadding(utf8.RuneCountInString(s)); padding = _tuple[0]; left = _tuple[1]; right = _tuple[2];
		if (left > 0) {
			f.writePadding(left, padding);
		}
		f.buf.WriteString(s);
		if (right > 0) {
			f.writePadding(right, padding);
		}
	};
	fmt.prototype.padString = function(s) { return this.$val.padString(s); };
	fmt.ptr.prototype.fmt_boolean = function(v) {
		var f, v;
		f = this;
		if (v) {
			f.pad(trueBytes);
		} else {
			f.pad(falseBytes);
		}
	};
	fmt.prototype.fmt_boolean = function(v) { return this.$val.fmt_boolean(v); };
	fmt.ptr.prototype.integer = function(a, base, signedness, digits) {
		var _ref, _ref$1, a, base, buf, digits, f, i, j, negative, next, prec, runeWidth, signedness, ua, width, width$1, x, x$1, x$2, x$3;
		f = this;
		if (f.fmtFlags.precPresent && (f.prec === 0) && (a.$high === 0 && a.$low === 0)) {
			return;
		}
		buf = $subslice(new sliceType(f.intbuf), 0);
		if (f.fmtFlags.widPresent) {
			width = f.wid;
			if ((base.$high === 0 && base.$low === 16) && f.fmtFlags.sharp) {
				width = width + (2) >> 0;
			}
			if (width > 65) {
				buf = $makeSlice(sliceType, width);
			}
		}
		negative = signedness === true && (a.$high < 0 || (a.$high === 0 && a.$low < 0));
		if (negative) {
			a = new $Int64(-a.$high, -a.$low);
		}
		prec = 0;
		if (f.fmtFlags.precPresent) {
			prec = f.prec;
			f.fmtFlags.zero = false;
		} else if (f.fmtFlags.zero && f.fmtFlags.widPresent && !f.fmtFlags.minus && f.wid > 0) {
			prec = f.wid;
			if (negative || f.fmtFlags.plus || f.fmtFlags.space) {
				prec = prec - (1) >> 0;
			}
		}
		i = buf.$length;
		ua = new $Uint64(a.$high, a.$low);
		_ref = base;
		if ((_ref.$high === 0 && _ref.$low === 10)) {
			while (true) {
				if (!((ua.$high > 0 || (ua.$high === 0 && ua.$low >= 10)))) { break; }
				i = i - (1) >> 0;
				next = $div64(ua, new $Uint64(0, 10), false);
				(i < 0 || i >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + i] = ((x = new $Uint64(0 + ua.$high, 48 + ua.$low), x$1 = $mul64(next, new $Uint64(0, 10)), new $Uint64(x.$high - x$1.$high, x.$low - x$1.$low)).$low << 24 >>> 24);
				ua = next;
			}
		} else if ((_ref.$high === 0 && _ref.$low === 16)) {
			while (true) {
				if (!((ua.$high > 0 || (ua.$high === 0 && ua.$low >= 16)))) { break; }
				i = i - (1) >> 0;
				(i < 0 || i >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + i] = digits.charCodeAt($flatten64(new $Uint64(ua.$high & 0, (ua.$low & 15) >>> 0)));
				ua = $shiftRightUint64(ua, (4));
			}
		} else if ((_ref.$high === 0 && _ref.$low === 8)) {
			while (true) {
				if (!((ua.$high > 0 || (ua.$high === 0 && ua.$low >= 8)))) { break; }
				i = i - (1) >> 0;
				(i < 0 || i >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + i] = ((x$2 = new $Uint64(ua.$high & 0, (ua.$low & 7) >>> 0), new $Uint64(0 + x$2.$high, 48 + x$2.$low)).$low << 24 >>> 24);
				ua = $shiftRightUint64(ua, (3));
			}
		} else if ((_ref.$high === 0 && _ref.$low === 2)) {
			while (true) {
				if (!((ua.$high > 0 || (ua.$high === 0 && ua.$low >= 2)))) { break; }
				i = i - (1) >> 0;
				(i < 0 || i >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + i] = ((x$3 = new $Uint64(ua.$high & 0, (ua.$low & 1) >>> 0), new $Uint64(0 + x$3.$high, 48 + x$3.$low)).$low << 24 >>> 24);
				ua = $shiftRightUint64(ua, (1));
			}
		} else {
			$panic(new $String("fmt: unknown base; can't happen"));
		}
		i = i - (1) >> 0;
		(i < 0 || i >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + i] = digits.charCodeAt($flatten64(ua));
		while (true) {
			if (!(i > 0 && prec > (buf.$length - i >> 0))) { break; }
			i = i - (1) >> 0;
			(i < 0 || i >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + i] = 48;
		}
		if (f.fmtFlags.sharp) {
			_ref$1 = base;
			if ((_ref$1.$high === 0 && _ref$1.$low === 8)) {
				if (!((((i < 0 || i >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + i]) === 48))) {
					i = i - (1) >> 0;
					(i < 0 || i >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + i] = 48;
				}
			} else if ((_ref$1.$high === 0 && _ref$1.$low === 16)) {
				i = i - (1) >> 0;
				(i < 0 || i >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + i] = (120 + digits.charCodeAt(10) << 24 >>> 24) - 97 << 24 >>> 24;
				i = i - (1) >> 0;
				(i < 0 || i >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + i] = 48;
			}
		}
		if (f.fmtFlags.unicode) {
			i = i - (1) >> 0;
			(i < 0 || i >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + i] = 43;
			i = i - (1) >> 0;
			(i < 0 || i >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + i] = 85;
		}
		if (negative) {
			i = i - (1) >> 0;
			(i < 0 || i >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + i] = 45;
		} else if (f.fmtFlags.plus) {
			i = i - (1) >> 0;
			(i < 0 || i >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + i] = 43;
		} else if (f.fmtFlags.space) {
			i = i - (1) >> 0;
			(i < 0 || i >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + i] = 32;
		}
		if (f.fmtFlags.unicode && f.fmtFlags.uniQuote && (a.$high > 0 || (a.$high === 0 && a.$low >= 0)) && (a.$high < 0 || (a.$high === 0 && a.$low <= 1114111)) && strconv.IsPrint(((a.$low + ((a.$high >> 31) * 4294967296)) >> 0))) {
			runeWidth = utf8.RuneLen(((a.$low + ((a.$high >> 31) * 4294967296)) >> 0));
			width$1 = (2 + runeWidth >> 0) + 1 >> 0;
			$copySlice($subslice(buf, (i - width$1 >> 0)), $subslice(buf, i));
			i = i - (width$1) >> 0;
			j = buf.$length - width$1 >> 0;
			(j < 0 || j >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + j] = 32;
			j = j + (1) >> 0;
			(j < 0 || j >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + j] = 39;
			j = j + (1) >> 0;
			utf8.EncodeRune($subslice(buf, j), ((a.$low + ((a.$high >> 31) * 4294967296)) >> 0));
			j = j + (runeWidth) >> 0;
			(j < 0 || j >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + j] = 39;
		}
		f.pad($subslice(buf, i));
	};
	fmt.prototype.integer = function(a, base, signedness, digits) { return this.$val.integer(a, base, signedness, digits); };
	fmt.ptr.prototype.truncate = function(s) {
		var _i, _ref, _rune, f, i, n, s;
		f = this;
		if (f.fmtFlags.precPresent && f.prec < utf8.RuneCountInString(s)) {
			n = f.prec;
			_ref = s;
			_i = 0;
			while (true) {
				if (!(_i < _ref.length)) { break; }
				_rune = $decodeRune(_ref, _i);
				i = _i;
				if (n === 0) {
					s = s.substring(0, i);
					break;
				}
				n = n - (1) >> 0;
				_i += _rune[1];
			}
		}
		return s;
	};
	fmt.prototype.truncate = function(s) { return this.$val.truncate(s); };
	fmt.ptr.prototype.fmt_s = function(s) {
		var f, s;
		f = this;
		s = f.truncate(s);
		f.padString(s);
	};
	fmt.prototype.fmt_s = function(s) { return this.$val.fmt_s(s); };
	fmt.ptr.prototype.fmt_sbx = function(s, b, digits) {
		var b, buf, c, digits, f, i, n, s, x;
		f = this;
		n = b.$length;
		if (b === sliceType.nil) {
			n = s.length;
		}
		x = (digits.charCodeAt(10) - 97 << 24 >>> 24) + 120 << 24 >>> 24;
		buf = sliceType.nil;
		i = 0;
		while (true) {
			if (!(i < n)) { break; }
			if (i > 0 && f.fmtFlags.space) {
				buf = $append(buf, 32);
			}
			if (f.fmtFlags.sharp && (f.fmtFlags.space || (i === 0))) {
				buf = $append(buf, 48, x);
			}
			c = 0;
			if (b === sliceType.nil) {
				c = s.charCodeAt(i);
			} else {
				c = ((i < 0 || i >= b.$length) ? $throwRuntimeError("index out of range") : b.$array[b.$offset + i]);
			}
			buf = $append(buf, digits.charCodeAt((c >>> 4 << 24 >>> 24)), digits.charCodeAt(((c & 15) >>> 0)));
			i = i + (1) >> 0;
		}
		f.pad(buf);
	};
	fmt.prototype.fmt_sbx = function(s, b, digits) { return this.$val.fmt_sbx(s, b, digits); };
	fmt.ptr.prototype.fmt_sx = function(s, digits) {
		var digits, f, s;
		f = this;
		if (f.fmtFlags.precPresent && f.prec < s.length) {
			s = s.substring(0, f.prec);
		}
		f.fmt_sbx(s, sliceType.nil, digits);
	};
	fmt.prototype.fmt_sx = function(s, digits) { return this.$val.fmt_sx(s, digits); };
	fmt.ptr.prototype.fmt_bx = function(b, digits) {
		var b, digits, f;
		f = this;
		if (f.fmtFlags.precPresent && f.prec < b.$length) {
			b = $subslice(b, 0, f.prec);
		}
		f.fmt_sbx("", b, digits);
	};
	fmt.prototype.fmt_bx = function(b, digits) { return this.$val.fmt_bx(b, digits); };
	fmt.ptr.prototype.fmt_q = function(s) {
		var f, quoted, s;
		f = this;
		s = f.truncate(s);
		quoted = "";
		if (f.fmtFlags.sharp && strconv.CanBackquote(s)) {
			quoted = "`" + s + "`";
		} else {
			if (f.fmtFlags.plus) {
				quoted = strconv.QuoteToASCII(s);
			} else {
				quoted = strconv.Quote(s);
			}
		}
		f.padString(quoted);
	};
	fmt.prototype.fmt_q = function(s) { return this.$val.fmt_q(s); };
	fmt.ptr.prototype.fmt_qc = function(c) {
		var c, f, quoted;
		f = this;
		quoted = sliceType.nil;
		if (f.fmtFlags.plus) {
			quoted = strconv.AppendQuoteRuneToASCII($subslice(new sliceType(f.intbuf), 0, 0), ((c.$low + ((c.$high >> 31) * 4294967296)) >> 0));
		} else {
			quoted = strconv.AppendQuoteRune($subslice(new sliceType(f.intbuf), 0, 0), ((c.$low + ((c.$high >> 31) * 4294967296)) >> 0));
		}
		f.pad(quoted);
	};
	fmt.prototype.fmt_qc = function(c) { return this.$val.fmt_qc(c); };
	doPrec = function(f, def) {
		var def, f;
		if (f.fmtFlags.precPresent) {
			return f.prec;
		}
		return def;
	};
	fmt.ptr.prototype.formatFloat = function(v, verb, prec, n) {
		var $deferred = [], $err = null, f, n, num, prec, v, verb;
		/* */ try { $deferFrames.push($deferred);
		f = this;
		num = strconv.AppendFloat($subslice(new sliceType(f.intbuf), 0, 1), v, verb, prec, n);
		if ((((1 < 0 || 1 >= num.$length) ? $throwRuntimeError("index out of range") : num.$array[num.$offset + 1]) === 45) || (((1 < 0 || 1 >= num.$length) ? $throwRuntimeError("index out of range") : num.$array[num.$offset + 1]) === 43)) {
			num = $subslice(num, 1);
		} else {
			(0 < 0 || 0 >= num.$length) ? $throwRuntimeError("index out of range") : num.$array[num.$offset + 0] = 43;
		}
		if (math.IsInf(v, 0)) {
			if (f.fmtFlags.zero) {
				$deferred.push([(function() {
					f.fmtFlags.zero = true;
				}), []]);
				f.fmtFlags.zero = false;
			}
		}
		if (f.fmtFlags.zero && f.fmtFlags.widPresent && f.wid > num.$length) {
			if (f.fmtFlags.space && v >= 0) {
				f.buf.WriteByte(32);
				f.wid = f.wid - (1) >> 0;
			} else if (f.fmtFlags.plus || v < 0) {
				f.buf.WriteByte(((0 < 0 || 0 >= num.$length) ? $throwRuntimeError("index out of range") : num.$array[num.$offset + 0]));
				f.wid = f.wid - (1) >> 0;
			}
			f.pad($subslice(num, 1));
			return;
		}
		if (f.fmtFlags.space && (((0 < 0 || 0 >= num.$length) ? $throwRuntimeError("index out of range") : num.$array[num.$offset + 0]) === 43)) {
			(0 < 0 || 0 >= num.$length) ? $throwRuntimeError("index out of range") : num.$array[num.$offset + 0] = 32;
			f.pad(num);
			return;
		}
		if (f.fmtFlags.plus || (((0 < 0 || 0 >= num.$length) ? $throwRuntimeError("index out of range") : num.$array[num.$offset + 0]) === 45) || math.IsInf(v, 0)) {
			f.pad(num);
			return;
		}
		f.pad($subslice(num, 1));
		/* */ } catch(err) { $err = err; } finally { $deferFrames.pop(); $callDeferred($deferred, $err); }
	};
	fmt.prototype.formatFloat = function(v, verb, prec, n) { return this.$val.formatFloat(v, verb, prec, n); };
	fmt.ptr.prototype.fmt_e64 = function(v) {
		var f, v;
		f = this;
		f.formatFloat(v, 101, doPrec(f, 6), 64);
	};
	fmt.prototype.fmt_e64 = function(v) { return this.$val.fmt_e64(v); };
	fmt.ptr.prototype.fmt_E64 = function(v) {
		var f, v;
		f = this;
		f.formatFloat(v, 69, doPrec(f, 6), 64);
	};
	fmt.prototype.fmt_E64 = function(v) { return this.$val.fmt_E64(v); };
	fmt.ptr.prototype.fmt_f64 = function(v) {
		var f, v;
		f = this;
		f.formatFloat(v, 102, doPrec(f, 6), 64);
	};
	fmt.prototype.fmt_f64 = function(v) { return this.$val.fmt_f64(v); };
	fmt.ptr.prototype.fmt_g64 = function(v) {
		var f, v;
		f = this;
		f.formatFloat(v, 103, doPrec(f, -1), 64);
	};
	fmt.prototype.fmt_g64 = function(v) { return this.$val.fmt_g64(v); };
	fmt.ptr.prototype.fmt_G64 = function(v) {
		var f, v;
		f = this;
		f.formatFloat(v, 71, doPrec(f, -1), 64);
	};
	fmt.prototype.fmt_G64 = function(v) { return this.$val.fmt_G64(v); };
	fmt.ptr.prototype.fmt_fb64 = function(v) {
		var f, v;
		f = this;
		f.formatFloat(v, 98, 0, 64);
	};
	fmt.prototype.fmt_fb64 = function(v) { return this.$val.fmt_fb64(v); };
	fmt.ptr.prototype.fmt_e32 = function(v) {
		var f, v;
		f = this;
		f.formatFloat($coerceFloat32(v), 101, doPrec(f, 6), 32);
	};
	fmt.prototype.fmt_e32 = function(v) { return this.$val.fmt_e32(v); };
	fmt.ptr.prototype.fmt_E32 = function(v) {
		var f, v;
		f = this;
		f.formatFloat($coerceFloat32(v), 69, doPrec(f, 6), 32);
	};
	fmt.prototype.fmt_E32 = function(v) { return this.$val.fmt_E32(v); };
	fmt.ptr.prototype.fmt_f32 = function(v) {
		var f, v;
		f = this;
		f.formatFloat($coerceFloat32(v), 102, doPrec(f, 6), 32);
	};
	fmt.prototype.fmt_f32 = function(v) { return this.$val.fmt_f32(v); };
	fmt.ptr.prototype.fmt_g32 = function(v) {
		var f, v;
		f = this;
		f.formatFloat($coerceFloat32(v), 103, doPrec(f, -1), 32);
	};
	fmt.prototype.fmt_g32 = function(v) { return this.$val.fmt_g32(v); };
	fmt.ptr.prototype.fmt_G32 = function(v) {
		var f, v;
		f = this;
		f.formatFloat($coerceFloat32(v), 71, doPrec(f, -1), 32);
	};
	fmt.prototype.fmt_G32 = function(v) { return this.$val.fmt_G32(v); };
	fmt.ptr.prototype.fmt_fb32 = function(v) {
		var f, v;
		f = this;
		f.formatFloat($coerceFloat32(v), 98, 0, 32);
	};
	fmt.prototype.fmt_fb32 = function(v) { return this.$val.fmt_fb32(v); };
	fmt.ptr.prototype.fmt_c64 = function(v, verb) {
		var f, v, verb;
		f = this;
		f.fmt_complex($coerceFloat32(v.$real), $coerceFloat32(v.$imag), 32, verb);
	};
	fmt.prototype.fmt_c64 = function(v, verb) { return this.$val.fmt_c64(v, verb); };
	fmt.ptr.prototype.fmt_c128 = function(v, verb) {
		var f, v, verb;
		f = this;
		f.fmt_complex(v.$real, v.$imag, 64, verb);
	};
	fmt.prototype.fmt_c128 = function(v, verb) { return this.$val.fmt_c128(v, verb); };
	fmt.ptr.prototype.fmt_complex = function(r, j, size, verb) {
		var _ref, f, i, j, oldPlus, oldSpace, oldWid, r, size, verb;
		f = this;
		f.buf.WriteByte(40);
		oldPlus = f.fmtFlags.plus;
		oldSpace = f.fmtFlags.space;
		oldWid = f.wid;
		i = 0;
		while (true) {
			if (!(true)) { break; }
			_ref = verb;
			if (_ref === 98) {
				f.formatFloat(r, 98, 0, size);
			} else if (_ref === 101) {
				f.formatFloat(r, 101, doPrec(f, 6), size);
			} else if (_ref === 69) {
				f.formatFloat(r, 69, doPrec(f, 6), size);
			} else if (_ref === 102 || _ref === 70) {
				f.formatFloat(r, 102, doPrec(f, 6), size);
			} else if (_ref === 103) {
				f.formatFloat(r, 103, doPrec(f, -1), size);
			} else if (_ref === 71) {
				f.formatFloat(r, 71, doPrec(f, -1), size);
			}
			if (!((i === 0))) {
				break;
			}
			f.fmtFlags.plus = true;
			f.fmtFlags.space = false;
			f.wid = oldWid;
			r = j;
			i = i + (1) >> 0;
		}
		f.fmtFlags.space = oldSpace;
		f.fmtFlags.plus = oldPlus;
		f.wid = oldWid;
		f.buf.Write(irparenBytes);
	};
	fmt.prototype.fmt_complex = function(r, j, size, verb) { return this.$val.fmt_complex(r, j, size, verb); };
	$ptrType(buffer).prototype.Write = function(p) {
		var _tmp, _tmp$1, b, err = $ifaceNil, n = 0, p;
		b = this;
		b.$set($appendSlice(b.$get(), p));
		_tmp = p.$length; _tmp$1 = $ifaceNil; n = _tmp; err = _tmp$1;
		return [n, err];
	};
	$ptrType(buffer).prototype.WriteString = function(s) {
		var _tmp, _tmp$1, b, err = $ifaceNil, n = 0, s;
		b = this;
		b.$set($appendSlice(b.$get(), new buffer($stringToBytes(s))));
		_tmp = s.length; _tmp$1 = $ifaceNil; n = _tmp; err = _tmp$1;
		return [n, err];
	};
	$ptrType(buffer).prototype.WriteByte = function(c) {
		var b, c;
		b = this;
		b.$set($append(b.$get(), c));
		return $ifaceNil;
	};
	$ptrType(buffer).prototype.WriteRune = function(r) {
		var b, bp, n, r, w, x;
		bp = this;
		if (r < 128) {
			bp.$set($append(bp.$get(), (r << 24 >>> 24)));
			return $ifaceNil;
		}
		b = bp.$get();
		n = b.$length;
		while (true) {
			if (!((n + 4 >> 0) > b.$capacity)) { break; }
			b = $append(b, 0);
		}
		w = utf8.EncodeRune((x = $subslice(b, n, (n + 4 >> 0)), $subslice(new sliceType(x.$array), x.$offset, x.$offset + x.$length)), r);
		bp.$set($subslice(b, 0, (n + w >> 0)));
		return $ifaceNil;
	};
	newPrinter = function() {
		var p;
		p = $assertType(ppFree.Get(), ptrType);
		p.panicking = false;
		p.erroring = false;
		p.fmt.init(new ptrType$1(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p));
		return p;
	};
	pp.ptr.prototype.free = function() {
		var p;
		p = this;
		if (p.buf.$capacity > 1024) {
			return;
		}
		p.buf = $subslice(p.buf, 0, 0);
		p.arg = $ifaceNil;
		p.value = new reflect.Value.ptr(ptrType$2.nil, 0, 0);
		ppFree.Put(p);
	};
	pp.prototype.free = function() { return this.$val.free(); };
	pp.ptr.prototype.Width = function() {
		var _tmp, _tmp$1, ok = false, p, wid = 0;
		p = this;
		_tmp = p.fmt.wid; _tmp$1 = p.fmt.fmtFlags.widPresent; wid = _tmp; ok = _tmp$1;
		return [wid, ok];
	};
	pp.prototype.Width = function() { return this.$val.Width(); };
	pp.ptr.prototype.Precision = function() {
		var _tmp, _tmp$1, ok = false, p, prec = 0;
		p = this;
		_tmp = p.fmt.prec; _tmp$1 = p.fmt.fmtFlags.precPresent; prec = _tmp; ok = _tmp$1;
		return [prec, ok];
	};
	pp.prototype.Precision = function() { return this.$val.Precision(); };
	pp.ptr.prototype.Flag = function(b) {
		var _ref, b, p;
		p = this;
		_ref = b;
		if (_ref === 45) {
			return p.fmt.fmtFlags.minus;
		} else if (_ref === 43) {
			return p.fmt.fmtFlags.plus;
		} else if (_ref === 35) {
			return p.fmt.fmtFlags.sharp;
		} else if (_ref === 32) {
			return p.fmt.fmtFlags.space;
		} else if (_ref === 48) {
			return p.fmt.fmtFlags.zero;
		}
		return false;
	};
	pp.prototype.Flag = function(b) { return this.$val.Flag(b); };
	pp.ptr.prototype.add = function(c) {
		var c, p;
		p = this;
		new ptrType$1(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteRune(c);
	};
	pp.prototype.add = function(c) { return this.$val.add(c); };
	pp.ptr.prototype.Write = function(b) {
		var _tuple, b, err = $ifaceNil, p, ret = 0;
		p = this;
		_tuple = new ptrType$1(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).Write(b); ret = _tuple[0]; err = _tuple[1];
		return [ret, err];
	};
	pp.prototype.Write = function(b) { return this.$val.Write(b); };
	Fprintln = $pkg.Fprintln = function(w, a) {
		var _tuple, a, err = $ifaceNil, n = 0, p, w, x;
		p = newPrinter();
		p.doPrint(a, true, true);
		_tuple = w.Write((x = p.buf, $subslice(new sliceType(x.$array), x.$offset, x.$offset + x.$length))); n = _tuple[0]; err = _tuple[1];
		p.free();
		return [n, err];
	};
	Println = $pkg.Println = function(a) {
		var _tuple, a, err = $ifaceNil, n = 0;
		_tuple = Fprintln(os.Stdout, a); n = _tuple[0]; err = _tuple[1];
		return [n, err];
	};
	getField = function(v, i) {
		var i, v, val;
		v = v;
		val = v.Field(i);
		if ((val.Kind() === 20) && !val.IsNil()) {
			val = val.Elem();
		}
		return val;
	};
	pp.ptr.prototype.unknownType = function(v) {
		var p, v;
		p = this;
		v = v;
		if (!v.IsValid()) {
			new ptrType$1(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).Write(nilAngleBytes);
			return;
		}
		new ptrType$1(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(63);
		new ptrType$1(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteString(v.Type().String());
		new ptrType$1(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(63);
	};
	pp.prototype.unknownType = function(v) { return this.$val.unknownType(v); };
	pp.ptr.prototype.badVerb = function(verb) {
		var p, verb;
		p = this;
		p.erroring = true;
		p.add(37);
		p.add(33);
		p.add(verb);
		p.add(40);
		if (!($interfaceIsEqual(p.arg, $ifaceNil))) {
			new ptrType$1(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteString(reflect.TypeOf(p.arg).String());
			p.add(61);
			p.printArg(p.arg, 118, 0);
		} else if (p.value.IsValid()) {
			new ptrType$1(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteString(p.value.Type().String());
			p.add(61);
			p.printValue(p.value, 118, 0);
		} else {
			new ptrType$1(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).Write(nilAngleBytes);
		}
		p.add(41);
		p.erroring = false;
	};
	pp.prototype.badVerb = function(verb) { return this.$val.badVerb(verb); };
	pp.ptr.prototype.fmtBool = function(v, verb) {
		var _ref, p, v, verb;
		p = this;
		_ref = verb;
		if (_ref === 116 || _ref === 118) {
			p.fmt.fmt_boolean(v);
		} else {
			p.badVerb(verb);
		}
	};
	pp.prototype.fmtBool = function(v, verb) { return this.$val.fmtBool(v, verb); };
	pp.ptr.prototype.fmtC = function(c) {
		var c, p, r, w, x;
		p = this;
		r = ((c.$low + ((c.$high >> 31) * 4294967296)) >> 0);
		if (!((x = new $Int64(0, r), (x.$high === c.$high && x.$low === c.$low)))) {
			r = 65533;
		}
		w = utf8.EncodeRune($subslice(new sliceType(p.runeBuf), 0, 4), r);
		p.fmt.pad($subslice(new sliceType(p.runeBuf), 0, w));
	};
	pp.prototype.fmtC = function(c) { return this.$val.fmtC(c); };
	pp.ptr.prototype.fmtInt64 = function(v, verb) {
		var _ref, p, v, verb;
		p = this;
		_ref = verb;
		if (_ref === 98) {
			p.fmt.integer(v, new $Uint64(0, 2), true, "0123456789abcdef");
		} else if (_ref === 99) {
			p.fmtC(v);
		} else if (_ref === 100 || _ref === 118) {
			p.fmt.integer(v, new $Uint64(0, 10), true, "0123456789abcdef");
		} else if (_ref === 111) {
			p.fmt.integer(v, new $Uint64(0, 8), true, "0123456789abcdef");
		} else if (_ref === 113) {
			if ((0 < v.$high || (0 === v.$high && 0 <= v.$low)) && (v.$high < 0 || (v.$high === 0 && v.$low <= 1114111))) {
				p.fmt.fmt_qc(v);
			} else {
				p.badVerb(verb);
			}
		} else if (_ref === 120) {
			p.fmt.integer(v, new $Uint64(0, 16), true, "0123456789abcdef");
		} else if (_ref === 85) {
			p.fmtUnicode(v);
		} else if (_ref === 88) {
			p.fmt.integer(v, new $Uint64(0, 16), true, "0123456789ABCDEF");
		} else {
			p.badVerb(verb);
		}
	};
	pp.prototype.fmtInt64 = function(v, verb) { return this.$val.fmtInt64(v, verb); };
	pp.ptr.prototype.fmt0x64 = function(v, leading0x) {
		var leading0x, p, sharp, v;
		p = this;
		sharp = p.fmt.fmtFlags.sharp;
		p.fmt.fmtFlags.sharp = leading0x;
		p.fmt.integer(new $Int64(v.$high, v.$low), new $Uint64(0, 16), false, "0123456789abcdef");
		p.fmt.fmtFlags.sharp = sharp;
	};
	pp.prototype.fmt0x64 = function(v, leading0x) { return this.$val.fmt0x64(v, leading0x); };
	pp.ptr.prototype.fmtUnicode = function(v) {
		var p, prec, precPresent, sharp, v;
		p = this;
		precPresent = p.fmt.fmtFlags.precPresent;
		sharp = p.fmt.fmtFlags.sharp;
		p.fmt.fmtFlags.sharp = false;
		prec = p.fmt.prec;
		if (!precPresent) {
			p.fmt.prec = 4;
			p.fmt.fmtFlags.precPresent = true;
		}
		p.fmt.fmtFlags.unicode = true;
		p.fmt.fmtFlags.uniQuote = sharp;
		p.fmt.integer(v, new $Uint64(0, 16), false, "0123456789ABCDEF");
		p.fmt.fmtFlags.unicode = false;
		p.fmt.fmtFlags.uniQuote = false;
		p.fmt.prec = prec;
		p.fmt.fmtFlags.precPresent = precPresent;
		p.fmt.fmtFlags.sharp = sharp;
	};
	pp.prototype.fmtUnicode = function(v) { return this.$val.fmtUnicode(v); };
	pp.ptr.prototype.fmtUint64 = function(v, verb) {
		var _ref, p, v, verb;
		p = this;
		_ref = verb;
		if (_ref === 98) {
			p.fmt.integer(new $Int64(v.$high, v.$low), new $Uint64(0, 2), false, "0123456789abcdef");
		} else if (_ref === 99) {
			p.fmtC(new $Int64(v.$high, v.$low));
		} else if (_ref === 100) {
			p.fmt.integer(new $Int64(v.$high, v.$low), new $Uint64(0, 10), false, "0123456789abcdef");
		} else if (_ref === 118) {
			if (p.fmt.fmtFlags.sharpV) {
				p.fmt0x64(v, true);
			} else {
				p.fmt.integer(new $Int64(v.$high, v.$low), new $Uint64(0, 10), false, "0123456789abcdef");
			}
		} else if (_ref === 111) {
			p.fmt.integer(new $Int64(v.$high, v.$low), new $Uint64(0, 8), false, "0123456789abcdef");
		} else if (_ref === 113) {
			if ((0 < v.$high || (0 === v.$high && 0 <= v.$low)) && (v.$high < 0 || (v.$high === 0 && v.$low <= 1114111))) {
				p.fmt.fmt_qc(new $Int64(v.$high, v.$low));
			} else {
				p.badVerb(verb);
			}
		} else if (_ref === 120) {
			p.fmt.integer(new $Int64(v.$high, v.$low), new $Uint64(0, 16), false, "0123456789abcdef");
		} else if (_ref === 88) {
			p.fmt.integer(new $Int64(v.$high, v.$low), new $Uint64(0, 16), false, "0123456789ABCDEF");
		} else if (_ref === 85) {
			p.fmtUnicode(new $Int64(v.$high, v.$low));
		} else {
			p.badVerb(verb);
		}
	};
	pp.prototype.fmtUint64 = function(v, verb) { return this.$val.fmtUint64(v, verb); };
	pp.ptr.prototype.fmtFloat32 = function(v, verb) {
		var _ref, p, v, verb;
		p = this;
		_ref = verb;
		if (_ref === 98) {
			p.fmt.fmt_fb32(v);
		} else if (_ref === 101) {
			p.fmt.fmt_e32(v);
		} else if (_ref === 69) {
			p.fmt.fmt_E32(v);
		} else if (_ref === 102 || _ref === 70) {
			p.fmt.fmt_f32(v);
		} else if (_ref === 103 || _ref === 118) {
			p.fmt.fmt_g32(v);
		} else if (_ref === 71) {
			p.fmt.fmt_G32(v);
		} else {
			p.badVerb(verb);
		}
	};
	pp.prototype.fmtFloat32 = function(v, verb) { return this.$val.fmtFloat32(v, verb); };
	pp.ptr.prototype.fmtFloat64 = function(v, verb) {
		var _ref, p, v, verb;
		p = this;
		_ref = verb;
		if (_ref === 98) {
			p.fmt.fmt_fb64(v);
		} else if (_ref === 101) {
			p.fmt.fmt_e64(v);
		} else if (_ref === 69) {
			p.fmt.fmt_E64(v);
		} else if (_ref === 102 || _ref === 70) {
			p.fmt.fmt_f64(v);
		} else if (_ref === 103 || _ref === 118) {
			p.fmt.fmt_g64(v);
		} else if (_ref === 71) {
			p.fmt.fmt_G64(v);
		} else {
			p.badVerb(verb);
		}
	};
	pp.prototype.fmtFloat64 = function(v, verb) { return this.$val.fmtFloat64(v, verb); };
	pp.ptr.prototype.fmtComplex64 = function(v, verb) {
		var _ref, p, v, verb;
		p = this;
		_ref = verb;
		if (_ref === 98 || _ref === 101 || _ref === 69 || _ref === 102 || _ref === 70 || _ref === 103 || _ref === 71) {
			p.fmt.fmt_c64(v, verb);
		} else if (_ref === 118) {
			p.fmt.fmt_c64(v, 103);
		} else {
			p.badVerb(verb);
		}
	};
	pp.prototype.fmtComplex64 = function(v, verb) { return this.$val.fmtComplex64(v, verb); };
	pp.ptr.prototype.fmtComplex128 = function(v, verb) {
		var _ref, p, v, verb;
		p = this;
		_ref = verb;
		if (_ref === 98 || _ref === 101 || _ref === 69 || _ref === 102 || _ref === 70 || _ref === 103 || _ref === 71) {
			p.fmt.fmt_c128(v, verb);
		} else if (_ref === 118) {
			p.fmt.fmt_c128(v, 103);
		} else {
			p.badVerb(verb);
		}
	};
	pp.prototype.fmtComplex128 = function(v, verb) { return this.$val.fmtComplex128(v, verb); };
	pp.ptr.prototype.fmtString = function(v, verb) {
		var _ref, p, v, verb;
		p = this;
		_ref = verb;
		if (_ref === 118) {
			if (p.fmt.fmtFlags.sharpV) {
				p.fmt.fmt_q(v);
			} else {
				p.fmt.fmt_s(v);
			}
		} else if (_ref === 115) {
			p.fmt.fmt_s(v);
		} else if (_ref === 120) {
			p.fmt.fmt_sx(v, "0123456789abcdef");
		} else if (_ref === 88) {
			p.fmt.fmt_sx(v, "0123456789ABCDEF");
		} else if (_ref === 113) {
			p.fmt.fmt_q(v);
		} else {
			p.badVerb(verb);
		}
	};
	pp.prototype.fmtString = function(v, verb) { return this.$val.fmtString(v, verb); };
	pp.ptr.prototype.fmtBytes = function(v, verb, typ, depth) {
		var _i, _ref, _ref$1, c, depth, i, p, typ, v, verb;
		p = this;
		if ((verb === 118) || (verb === 100)) {
			if (p.fmt.fmtFlags.sharpV) {
				if (v === sliceType.nil) {
					if ($interfaceIsEqual(typ, $ifaceNil)) {
						new ptrType$1(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteString("[]byte(nil)");
					} else {
						new ptrType$1(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteString(typ.String());
						new ptrType$1(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).Write(nilParenBytes);
					}
					return;
				}
				if ($interfaceIsEqual(typ, $ifaceNil)) {
					new ptrType$1(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).Write(bytesBytes);
				} else {
					new ptrType$1(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteString(typ.String());
					new ptrType$1(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(123);
				}
			} else {
				new ptrType$1(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(91);
			}
			_ref = v;
			_i = 0;
			while (true) {
				if (!(_i < _ref.$length)) { break; }
				i = _i;
				c = ((_i < 0 || _i >= _ref.$length) ? $throwRuntimeError("index out of range") : _ref.$array[_ref.$offset + _i]);
				if (i > 0) {
					if (p.fmt.fmtFlags.sharpV) {
						new ptrType$1(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).Write(commaSpaceBytes);
					} else {
						new ptrType$1(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(32);
					}
				}
				p.printArg(new $Uint8(c), 118, depth + 1 >> 0);
				_i++;
			}
			if (p.fmt.fmtFlags.sharpV) {
				new ptrType$1(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(125);
			} else {
				new ptrType$1(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(93);
			}
			return;
		}
		_ref$1 = verb;
		if (_ref$1 === 115) {
			p.fmt.fmt_s($bytesToString(v));
		} else if (_ref$1 === 120) {
			p.fmt.fmt_bx(v, "0123456789abcdef");
		} else if (_ref$1 === 88) {
			p.fmt.fmt_bx(v, "0123456789ABCDEF");
		} else if (_ref$1 === 113) {
			p.fmt.fmt_q($bytesToString(v));
		} else {
			p.badVerb(verb);
		}
	};
	pp.prototype.fmtBytes = function(v, verb, typ, depth) { return this.$val.fmtBytes(v, verb, typ, depth); };
	pp.ptr.prototype.fmtPointer = function(value, verb) {
		var _ref, _ref$1, p, u, use0x64, value, verb;
		p = this;
		value = value;
		use0x64 = true;
		_ref = verb;
		if (_ref === 112 || _ref === 118) {
		} else if (_ref === 98 || _ref === 100 || _ref === 111 || _ref === 120 || _ref === 88) {
			use0x64 = false;
		} else {
			p.badVerb(verb);
			return;
		}
		u = 0;
		_ref$1 = value.Kind();
		if (_ref$1 === 18 || _ref$1 === 19 || _ref$1 === 21 || _ref$1 === 22 || _ref$1 === 23 || _ref$1 === 26) {
			u = value.Pointer();
		} else {
			p.badVerb(verb);
			return;
		}
		if (p.fmt.fmtFlags.sharpV) {
			p.add(40);
			new ptrType$1(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteString(value.Type().String());
			p.add(41);
			p.add(40);
			if (u === 0) {
				new ptrType$1(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).Write(nilBytes);
			} else {
				p.fmt0x64(new $Uint64(0, u.constructor === Number ? u : 1), true);
			}
			p.add(41);
		} else if ((verb === 118) && (u === 0)) {
			new ptrType$1(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).Write(nilAngleBytes);
		} else {
			if (use0x64) {
				p.fmt0x64(new $Uint64(0, u.constructor === Number ? u : 1), !p.fmt.fmtFlags.sharp);
			} else {
				p.fmtUint64(new $Uint64(0, u.constructor === Number ? u : 1), verb);
			}
		}
	};
	pp.prototype.fmtPointer = function(value, verb) { return this.$val.fmtPointer(value, verb); };
	pp.ptr.prototype.catchPanic = function(arg, verb) {
		var arg, err, p, v, verb;
		p = this;
		err = $recover();
		if (!($interfaceIsEqual(err, $ifaceNil))) {
			v = reflect.ValueOf(arg);
			if ((v.Kind() === 22) && v.IsNil()) {
				new ptrType$1(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).Write(nilAngleBytes);
				return;
			}
			if (p.panicking) {
				$panic(err);
			}
			p.fmt.clearflags();
			new ptrType$1(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).Write(percentBangBytes);
			p.add(verb);
			new ptrType$1(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).Write(panicBytes);
			p.panicking = true;
			p.printArg(err, 118, 0);
			p.panicking = false;
			new ptrType$1(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(41);
		}
	};
	pp.prototype.catchPanic = function(arg, verb) { return this.$val.catchPanic(arg, verb); };
	pp.ptr.prototype.clearSpecialFlags = function() {
		var p, plusV = false, sharpV = false;
		p = this;
		plusV = p.fmt.fmtFlags.plusV;
		if (plusV) {
			p.fmt.fmtFlags.plus = true;
			p.fmt.fmtFlags.plusV = false;
		}
		sharpV = p.fmt.fmtFlags.sharpV;
		if (sharpV) {
			p.fmt.fmtFlags.sharp = true;
			p.fmt.fmtFlags.sharpV = false;
		}
		return [plusV, sharpV];
	};
	pp.prototype.clearSpecialFlags = function() { return this.$val.clearSpecialFlags(); };
	pp.ptr.prototype.restoreSpecialFlags = function(plusV, sharpV) {
		var p, plusV, sharpV;
		p = this;
		if (plusV) {
			p.fmt.fmtFlags.plus = false;
			p.fmt.fmtFlags.plusV = true;
		}
		if (sharpV) {
			p.fmt.fmtFlags.sharp = false;
			p.fmt.fmtFlags.sharpV = true;
		}
	};
	pp.prototype.restoreSpecialFlags = function(plusV, sharpV) { return this.$val.restoreSpecialFlags(plusV, sharpV); };
	pp.ptr.prototype.handleMethods = function(verb, depth) {
		var $deferred = [], $err = null, _ref, _ref$1, _tuple, _tuple$1, _tuple$2, depth, formatter, handled = false, ok, ok$1, p, stringer, v, verb;
		/* */ try { $deferFrames.push($deferred);
		p = this;
		if (p.erroring) {
			return handled;
		}
		_tuple = $assertType(p.arg, Formatter, true); formatter = _tuple[0]; ok = _tuple[1];
		if (ok) {
			handled = true;
			_tuple$1 = p.clearSpecialFlags();
			$deferred.push([$methodVal(p, "restoreSpecialFlags"), [_tuple$1[0], _tuple$1[1]]]);
			$deferred.push([$methodVal(p, "catchPanic"), [p.arg, verb]]);
			formatter.Format(p, verb);
			return handled;
		}
		if (p.fmt.fmtFlags.sharpV) {
			_tuple$2 = $assertType(p.arg, GoStringer, true); stringer = _tuple$2[0]; ok$1 = _tuple$2[1];
			if (ok$1) {
				handled = true;
				$deferred.push([$methodVal(p, "catchPanic"), [p.arg, verb]]);
				p.fmt.fmt_s(stringer.GoString());
				return handled;
			}
		} else {
			_ref = verb;
			if (_ref === 118 || _ref === 115 || _ref === 120 || _ref === 88 || _ref === 113) {
				_ref$1 = p.arg;
				if ($assertType(_ref$1, $error, true)[1]) {
					v = _ref$1;
					handled = true;
					$deferred.push([$methodVal(p, "catchPanic"), [p.arg, verb]]);
					p.printArg(new $String(v.Error()), verb, depth);
					return handled;
				} else if ($assertType(_ref$1, Stringer, true)[1]) {
					v = _ref$1;
					handled = true;
					$deferred.push([$methodVal(p, "catchPanic"), [p.arg, verb]]);
					p.printArg(new $String(v.String()), verb, depth);
					return handled;
				}
			}
		}
		handled = false;
		return handled;
		/* */ } catch(err) { $err = err; } finally { $deferFrames.pop(); $callDeferred($deferred, $err); return handled; }
	};
	pp.prototype.handleMethods = function(verb, depth) { return this.$val.handleMethods(verb, depth); };
	pp.ptr.prototype.printArg = function(arg, verb, depth) {
		var _ref, _ref$1, arg, depth, f, handled, p, verb, wasString = false;
		p = this;
		p.arg = arg;
		p.value = new reflect.Value.ptr(ptrType$2.nil, 0, 0);
		if ($interfaceIsEqual(arg, $ifaceNil)) {
			if ((verb === 84) || (verb === 118)) {
				p.fmt.pad(nilAngleBytes);
			} else {
				p.badVerb(verb);
			}
			wasString = false;
			return wasString;
		}
		_ref = verb;
		if (_ref === 84) {
			p.printArg(new $String(reflect.TypeOf(arg).String()), 115, 0);
			wasString = false;
			return wasString;
		} else if (_ref === 112) {
			p.fmtPointer(reflect.ValueOf(arg), verb);
			wasString = false;
			return wasString;
		}
		_ref$1 = arg;
		if ($assertType(_ref$1, $Bool, true)[1]) {
			f = _ref$1.$val;
			p.fmtBool(f, verb);
		} else if ($assertType(_ref$1, $Float32, true)[1]) {
			f = _ref$1.$val;
			p.fmtFloat32(f, verb);
		} else if ($assertType(_ref$1, $Float64, true)[1]) {
			f = _ref$1.$val;
			p.fmtFloat64(f, verb);
		} else if ($assertType(_ref$1, $Complex64, true)[1]) {
			f = _ref$1.$val;
			p.fmtComplex64(f, verb);
		} else if ($assertType(_ref$1, $Complex128, true)[1]) {
			f = _ref$1.$val;
			p.fmtComplex128(f, verb);
		} else if ($assertType(_ref$1, $Int, true)[1]) {
			f = _ref$1.$val;
			p.fmtInt64(new $Int64(0, f), verb);
		} else if ($assertType(_ref$1, $Int8, true)[1]) {
			f = _ref$1.$val;
			p.fmtInt64(new $Int64(0, f), verb);
		} else if ($assertType(_ref$1, $Int16, true)[1]) {
			f = _ref$1.$val;
			p.fmtInt64(new $Int64(0, f), verb);
		} else if ($assertType(_ref$1, $Int32, true)[1]) {
			f = _ref$1.$val;
			p.fmtInt64(new $Int64(0, f), verb);
		} else if ($assertType(_ref$1, $Int64, true)[1]) {
			f = _ref$1.$val;
			p.fmtInt64(f, verb);
		} else if ($assertType(_ref$1, $Uint, true)[1]) {
			f = _ref$1.$val;
			p.fmtUint64(new $Uint64(0, f), verb);
		} else if ($assertType(_ref$1, $Uint8, true)[1]) {
			f = _ref$1.$val;
			p.fmtUint64(new $Uint64(0, f), verb);
		} else if ($assertType(_ref$1, $Uint16, true)[1]) {
			f = _ref$1.$val;
			p.fmtUint64(new $Uint64(0, f), verb);
		} else if ($assertType(_ref$1, $Uint32, true)[1]) {
			f = _ref$1.$val;
			p.fmtUint64(new $Uint64(0, f), verb);
		} else if ($assertType(_ref$1, $Uint64, true)[1]) {
			f = _ref$1.$val;
			p.fmtUint64(f, verb);
		} else if ($assertType(_ref$1, $Uintptr, true)[1]) {
			f = _ref$1.$val;
			p.fmtUint64(new $Uint64(0, f.constructor === Number ? f : 1), verb);
		} else if ($assertType(_ref$1, $String, true)[1]) {
			f = _ref$1.$val;
			p.fmtString(f, verb);
			wasString = (verb === 115) || (verb === 118);
		} else if ($assertType(_ref$1, sliceType, true)[1]) {
			f = _ref$1.$val;
			p.fmtBytes(f, verb, $ifaceNil, depth);
			wasString = verb === 115;
		} else {
			f = _ref$1;
			handled = p.handleMethods(verb, depth);
			if (handled) {
				wasString = false;
				return wasString;
			}
			wasString = p.printReflectValue(reflect.ValueOf(arg), verb, depth);
			return wasString;
		}
		p.arg = $ifaceNil;
		return wasString;
	};
	pp.prototype.printArg = function(arg, verb, depth) { return this.$val.printArg(arg, verb, depth); };
	pp.ptr.prototype.printValue = function(value, verb, depth) {
		var _ref, depth, handled, p, value, verb, wasString = false;
		p = this;
		value = value;
		if (!value.IsValid()) {
			if ((verb === 84) || (verb === 118)) {
				new ptrType$1(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).Write(nilAngleBytes);
			} else {
				p.badVerb(verb);
			}
			wasString = false;
			return wasString;
		}
		_ref = verb;
		if (_ref === 84) {
			p.printArg(new $String(value.Type().String()), 115, 0);
			wasString = false;
			return wasString;
		} else if (_ref === 112) {
			p.fmtPointer(value, verb);
			wasString = false;
			return wasString;
		}
		p.arg = $ifaceNil;
		if (value.CanInterface()) {
			p.arg = value.Interface();
		}
		handled = p.handleMethods(verb, depth);
		if (handled) {
			wasString = false;
			return wasString;
		}
		wasString = p.printReflectValue(value, verb, depth);
		return wasString;
	};
	pp.prototype.printValue = function(value, verb, depth) { return this.$val.printValue(value, verb, depth); };
	pp.ptr.prototype.printReflectValue = function(value, verb, depth) {
		var _i, _i$1, _ref, _ref$1, _ref$2, _ref$3, a, bytes, depth, f, f$1, i, i$1, i$2, i$3, key, keys, oldValue, p, t, typ, v, v$1, value, value$1, verb, wasString = false, x;
		p = this;
		value = value;
		oldValue = p.value;
		p.value = value;
		f = value;
		_ref = f.Kind();
		BigSwitch:
		switch (0) { default: if (_ref === 1) {
			p.fmtBool(f.Bool(), verb);
		} else if (_ref === 2 || _ref === 3 || _ref === 4 || _ref === 5 || _ref === 6) {
			p.fmtInt64(f.Int(), verb);
		} else if (_ref === 7 || _ref === 8 || _ref === 9 || _ref === 10 || _ref === 11 || _ref === 12) {
			p.fmtUint64(f.Uint(), verb);
		} else if (_ref === 13 || _ref === 14) {
			if (f.Type().Size() === 4) {
				p.fmtFloat32(f.Float(), verb);
			} else {
				p.fmtFloat64(f.Float(), verb);
			}
		} else if (_ref === 15 || _ref === 16) {
			if (f.Type().Size() === 8) {
				p.fmtComplex64((x = f.Complex(), new $Complex64(x.$real, x.$imag)), verb);
			} else {
				p.fmtComplex128(f.Complex(), verb);
			}
		} else if (_ref === 24) {
			p.fmtString(f.String(), verb);
		} else if (_ref === 21) {
			if (p.fmt.fmtFlags.sharpV) {
				new ptrType$1(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteString(f.Type().String());
				if (f.IsNil()) {
					new ptrType$1(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteString("(nil)");
					break;
				}
				new ptrType$1(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(123);
			} else {
				new ptrType$1(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).Write(mapBytes);
			}
			keys = f.MapKeys();
			_ref$1 = keys;
			_i = 0;
			while (true) {
				if (!(_i < _ref$1.$length)) { break; }
				i = _i;
				key = ((_i < 0 || _i >= _ref$1.$length) ? $throwRuntimeError("index out of range") : _ref$1.$array[_ref$1.$offset + _i]);
				if (i > 0) {
					if (p.fmt.fmtFlags.sharpV) {
						new ptrType$1(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).Write(commaSpaceBytes);
					} else {
						new ptrType$1(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(32);
					}
				}
				p.printValue(key, verb, depth + 1 >> 0);
				new ptrType$1(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(58);
				p.printValue(f.MapIndex(key), verb, depth + 1 >> 0);
				_i++;
			}
			if (p.fmt.fmtFlags.sharpV) {
				new ptrType$1(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(125);
			} else {
				new ptrType$1(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(93);
			}
		} else if (_ref === 25) {
			if (p.fmt.fmtFlags.sharpV) {
				new ptrType$1(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteString(value.Type().String());
			}
			p.add(123);
			v = f;
			t = v.Type();
			i$1 = 0;
			while (true) {
				if (!(i$1 < v.NumField())) { break; }
				if (i$1 > 0) {
					if (p.fmt.fmtFlags.sharpV) {
						new ptrType$1(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).Write(commaSpaceBytes);
					} else {
						new ptrType$1(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(32);
					}
				}
				if (p.fmt.fmtFlags.plusV || p.fmt.fmtFlags.sharpV) {
					f$1 = $clone(t.Field(i$1), reflect.StructField);
					if (!(f$1.Name === "")) {
						new ptrType$1(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteString(f$1.Name);
						new ptrType$1(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(58);
					}
				}
				p.printValue(getField(v, i$1), verb, depth + 1 >> 0);
				i$1 = i$1 + (1) >> 0;
			}
			new ptrType$1(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(125);
		} else if (_ref === 20) {
			value$1 = f.Elem();
			if (!value$1.IsValid()) {
				if (p.fmt.fmtFlags.sharpV) {
					new ptrType$1(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteString(f.Type().String());
					new ptrType$1(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).Write(nilParenBytes);
				} else {
					new ptrType$1(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).Write(nilAngleBytes);
				}
			} else {
				wasString = p.printValue(value$1, verb, depth + 1 >> 0);
			}
		} else if (_ref === 17 || _ref === 23) {
			typ = f.Type();
			if ((typ.Elem().Kind() === 8) && ($interfaceIsEqual(typ.Elem(), byteType) || (verb === 115) || (verb === 113) || (verb === 120))) {
				bytes = sliceType.nil;
				if (f.Kind() === 23) {
					bytes = f.Bytes();
				} else if (f.CanAddr()) {
					bytes = f.Slice(0, f.Len()).Bytes();
				} else {
					bytes = $makeSlice(sliceType, f.Len());
					_ref$2 = bytes;
					_i$1 = 0;
					while (true) {
						if (!(_i$1 < _ref$2.$length)) { break; }
						i$2 = _i$1;
						(i$2 < 0 || i$2 >= bytes.$length) ? $throwRuntimeError("index out of range") : bytes.$array[bytes.$offset + i$2] = (f.Index(i$2).Uint().$low << 24 >>> 24);
						_i$1++;
					}
				}
				p.fmtBytes(bytes, verb, typ, depth);
				wasString = verb === 115;
				break;
			}
			if (p.fmt.fmtFlags.sharpV) {
				new ptrType$1(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteString(value.Type().String());
				if ((f.Kind() === 23) && f.IsNil()) {
					new ptrType$1(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteString("(nil)");
					break;
				}
				new ptrType$1(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(123);
			} else {
				new ptrType$1(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(91);
			}
			i$3 = 0;
			while (true) {
				if (!(i$3 < f.Len())) { break; }
				if (i$3 > 0) {
					if (p.fmt.fmtFlags.sharpV) {
						new ptrType$1(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).Write(commaSpaceBytes);
					} else {
						new ptrType$1(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(32);
					}
				}
				p.printValue(f.Index(i$3), verb, depth + 1 >> 0);
				i$3 = i$3 + (1) >> 0;
			}
			if (p.fmt.fmtFlags.sharpV) {
				new ptrType$1(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(125);
			} else {
				new ptrType$1(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(93);
			}
		} else if (_ref === 22) {
			v$1 = f.Pointer();
			if (!((v$1 === 0)) && (depth === 0)) {
				a = f.Elem();
				_ref$3 = a.Kind();
				if (_ref$3 === 17 || _ref$3 === 23) {
					new ptrType$1(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(38);
					p.printValue(a, verb, depth + 1 >> 0);
					break BigSwitch;
				} else if (_ref$3 === 25) {
					new ptrType$1(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(38);
					p.printValue(a, verb, depth + 1 >> 0);
					break BigSwitch;
				} else if (_ref$3 === 21) {
					new ptrType$1(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(38);
					p.printValue(a, verb, depth + 1 >> 0);
					break BigSwitch;
				}
			}
			p.fmtPointer(value, verb);
		} else if (_ref === 18 || _ref === 19 || _ref === 26) {
			p.fmtPointer(value, verb);
		} else {
			p.unknownType(f);
		} }
		p.value = oldValue;
		wasString = wasString;
		return wasString;
	};
	pp.prototype.printReflectValue = function(value, verb, depth) { return this.$val.printReflectValue(value, verb, depth); };
	pp.ptr.prototype.doPrint = function(a, addspace, addnewline) {
		var a, addnewline, addspace, arg, argNum, isString, p, prevString;
		p = this;
		prevString = false;
		argNum = 0;
		while (true) {
			if (!(argNum < a.$length)) { break; }
			p.fmt.clearflags();
			arg = ((argNum < 0 || argNum >= a.$length) ? $throwRuntimeError("index out of range") : a.$array[a.$offset + argNum]);
			if (argNum > 0) {
				isString = !($interfaceIsEqual(arg, $ifaceNil)) && (reflect.TypeOf(arg).Kind() === 24);
				if (addspace || !isString && !prevString) {
					new ptrType$1(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(32);
				}
			}
			prevString = p.printArg(arg, 118, 0);
			argNum = argNum + (1) >> 0;
		}
		if (addnewline) {
			new ptrType$1(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(10);
		}
	};
	pp.prototype.doPrint = function(a, addspace, addnewline) { return this.$val.doPrint(a, addspace, addnewline); };
	ss.ptr.prototype.Read = function(buf) {
		var _tmp, _tmp$1, buf, err = $ifaceNil, n = 0, s;
		s = this;
		_tmp = 0; _tmp$1 = errors.New("ScanState's Read should not be called. Use ReadRune"); n = _tmp; err = _tmp$1;
		return [n, err];
	};
	ss.prototype.Read = function(buf) { return this.$val.Read(buf); };
	ss.ptr.prototype.ReadRune = function() {
		var _tuple, err = $ifaceNil, r = 0, s, size = 0;
		s = this;
		if (s.peekRune >= 0) {
			s.count = s.count + (1) >> 0;
			r = s.peekRune;
			size = utf8.RuneLen(r);
			s.prevRune = r;
			s.peekRune = -1;
			return [r, size, err];
		}
		if (s.atEOF || s.ssave.nlIsEnd && (s.prevRune === 10) || s.count >= s.ssave.argLimit) {
			err = io.EOF;
			return [r, size, err];
		}
		_tuple = s.rr.ReadRune(); r = _tuple[0]; size = _tuple[1]; err = _tuple[2];
		if ($interfaceIsEqual(err, $ifaceNil)) {
			s.count = s.count + (1) >> 0;
			s.prevRune = r;
		} else if ($interfaceIsEqual(err, io.EOF)) {
			s.atEOF = true;
		}
		return [r, size, err];
	};
	ss.prototype.ReadRune = function() { return this.$val.ReadRune(); };
	ss.ptr.prototype.Width = function() {
		var _tmp, _tmp$1, _tmp$2, _tmp$3, ok = false, s, wid = 0;
		s = this;
		if (s.ssave.maxWid === 1073741824) {
			_tmp = 0; _tmp$1 = false; wid = _tmp; ok = _tmp$1;
			return [wid, ok];
		}
		_tmp$2 = s.ssave.maxWid; _tmp$3 = true; wid = _tmp$2; ok = _tmp$3;
		return [wid, ok];
	};
	ss.prototype.Width = function() { return this.$val.Width(); };
	ss.ptr.prototype.getRune = function() {
		var _tuple, err, r = 0, s;
		s = this;
		_tuple = s.ReadRune(); r = _tuple[0]; err = _tuple[2];
		if (!($interfaceIsEqual(err, $ifaceNil))) {
			if ($interfaceIsEqual(err, io.EOF)) {
				r = -1;
				return r;
			}
			s.error(err);
		}
		return r;
	};
	ss.prototype.getRune = function() { return this.$val.getRune(); };
	ss.ptr.prototype.UnreadRune = function() {
		var _tuple, ok, s, u;
		s = this;
		_tuple = $assertType(s.rr, runeUnreader, true); u = _tuple[0]; ok = _tuple[1];
		if (ok) {
			u.UnreadRune();
		} else {
			s.peekRune = s.prevRune;
		}
		s.prevRune = -1;
		s.count = s.count - (1) >> 0;
		return $ifaceNil;
	};
	ss.prototype.UnreadRune = function() { return this.$val.UnreadRune(); };
	ss.ptr.prototype.error = function(err) {
		var err, s, x;
		s = this;
		$panic((x = new scanError.ptr(err), new x.constructor.elem(x)));
	};
	ss.prototype.error = function(err) { return this.$val.error(err); };
	ss.ptr.prototype.errorString = function(err) {
		var err, s, x;
		s = this;
		$panic((x = new scanError.ptr(errors.New(err)), new x.constructor.elem(x)));
	};
	ss.prototype.errorString = function(err) { return this.$val.errorString(err); };
	ss.ptr.prototype.Token = function(skipSpace, f) {
		var $deferred = [], $err = null, err = $ifaceNil, f, s, skipSpace, tok = sliceType.nil;
		/* */ try { $deferFrames.push($deferred);
		s = this;
		$deferred.push([(function() {
			var _tuple, e, ok, se;
			e = $recover();
			if (!($interfaceIsEqual(e, $ifaceNil))) {
				_tuple = $assertType(e, scanError, true); se = $clone(_tuple[0], scanError); ok = _tuple[1];
				if (ok) {
					err = se.err;
				} else {
					$panic(e);
				}
			}
		}), []]);
		if (f === $throwNilPointerError) {
			f = notSpace;
		}
		s.buf = $subslice(s.buf, 0, 0);
		tok = s.token(skipSpace, f);
		return [tok, err];
		/* */ } catch(err) { $err = err; } finally { $deferFrames.pop(); $callDeferred($deferred, $err); return [tok, err]; }
	};
	ss.prototype.Token = function(skipSpace, f) { return this.$val.Token(skipSpace, f); };
	isSpace = function(r) {
		var _i, _ref, r, rng, rx;
		if (r >= 65536) {
			return false;
		}
		rx = (r << 16 >>> 16);
		_ref = space;
		_i = 0;
		while (true) {
			if (!(_i < _ref.$length)) { break; }
			rng = $clone(((_i < 0 || _i >= _ref.$length) ? $throwRuntimeError("index out of range") : _ref.$array[_ref.$offset + _i]), arrayType);
			if (rx < rng[0]) {
				return false;
			}
			if (rx <= rng[1]) {
				return true;
			}
			_i++;
		}
		return false;
	};
	notSpace = function(r) {
		var r;
		return !isSpace(r);
	};
	ss.ptr.prototype.SkipSpace = function() {
		var s;
		s = this;
		s.skipSpace(false);
	};
	ss.prototype.SkipSpace = function() { return this.$val.SkipSpace(); };
	ss.ptr.prototype.free = function(old) {
		var old, s;
		s = this;
		old = $clone(old, ssave);
		if (old.validSave) {
			$copy(s.ssave, old, ssave);
			return;
		}
		if (s.buf.$capacity > 1024) {
			return;
		}
		s.buf = $subslice(s.buf, 0, 0);
		s.rr = $ifaceNil;
		ssFree.Put(s);
	};
	ss.prototype.free = function(old) { return this.$val.free(old); };
	ss.ptr.prototype.skipSpace = function(stopAtNewline) {
		var r, s, stopAtNewline;
		s = this;
		while (true) {
			if (!(true)) { break; }
			r = s.getRune();
			if (r === -1) {
				return;
			}
			if ((r === 13) && s.peek("\n")) {
				continue;
			}
			if (r === 10) {
				if (stopAtNewline) {
					break;
				}
				if (s.ssave.nlIsSpace) {
					continue;
				}
				s.errorString("unexpected newline");
				return;
			}
			if (!isSpace(r)) {
				s.UnreadRune();
				break;
			}
		}
	};
	ss.prototype.skipSpace = function(stopAtNewline) { return this.$val.skipSpace(stopAtNewline); };
	ss.ptr.prototype.token = function(skipSpace, f) {
		var f, r, s, skipSpace, x;
		s = this;
		if (skipSpace) {
			s.skipSpace(false);
		}
		while (true) {
			if (!(true)) { break; }
			r = s.getRune();
			if (r === -1) {
				break;
			}
			if (!f(r)) {
				s.UnreadRune();
				break;
			}
			new ptrType$1(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, s).WriteRune(r);
		}
		return (x = s.buf, $subslice(new sliceType(x.$array), x.$offset, x.$offset + x.$length));
	};
	ss.prototype.token = function(skipSpace, f) { return this.$val.token(skipSpace, f); };
	indexRune = function(s, r) {
		var _i, _ref, _rune, c, i, r, s;
		_ref = s;
		_i = 0;
		while (true) {
			if (!(_i < _ref.length)) { break; }
			_rune = $decodeRune(_ref, _i);
			i = _i;
			c = _rune[0];
			if (c === r) {
				return i;
			}
			_i += _rune[1];
		}
		return -1;
	};
	ss.ptr.prototype.peek = function(ok) {
		var ok, r, s;
		s = this;
		r = s.getRune();
		if (!((r === -1))) {
			s.UnreadRune();
		}
		return indexRune(ok, r) >= 0;
	};
	ss.prototype.peek = function(ok) { return this.$val.peek(ok); };
	ptrType$25.methods = [{prop: "clearflags", name: "clearflags", pkg: "fmt", typ: $funcType([], [], false)}, {prop: "init", name: "init", pkg: "fmt", typ: $funcType([ptrType$1], [], false)}, {prop: "computePadding", name: "computePadding", pkg: "fmt", typ: $funcType([$Int], [sliceType, $Int, $Int], false)}, {prop: "writePadding", name: "writePadding", pkg: "fmt", typ: $funcType([$Int, sliceType], [], false)}, {prop: "pad", name: "pad", pkg: "fmt", typ: $funcType([sliceType], [], false)}, {prop: "padString", name: "padString", pkg: "fmt", typ: $funcType([$String], [], false)}, {prop: "fmt_boolean", name: "fmt_boolean", pkg: "fmt", typ: $funcType([$Bool], [], false)}, {prop: "integer", name: "integer", pkg: "fmt", typ: $funcType([$Int64, $Uint64, $Bool, $String], [], false)}, {prop: "truncate", name: "truncate", pkg: "fmt", typ: $funcType([$String], [$String], false)}, {prop: "fmt_s", name: "fmt_s", pkg: "fmt", typ: $funcType([$String], [], false)}, {prop: "fmt_sbx", name: "fmt_sbx", pkg: "fmt", typ: $funcType([$String, sliceType, $String], [], false)}, {prop: "fmt_sx", name: "fmt_sx", pkg: "fmt", typ: $funcType([$String, $String], [], false)}, {prop: "fmt_bx", name: "fmt_bx", pkg: "fmt", typ: $funcType([sliceType, $String], [], false)}, {prop: "fmt_q", name: "fmt_q", pkg: "fmt", typ: $funcType([$String], [], false)}, {prop: "fmt_qc", name: "fmt_qc", pkg: "fmt", typ: $funcType([$Int64], [], false)}, {prop: "formatFloat", name: "formatFloat", pkg: "fmt", typ: $funcType([$Float64, $Uint8, $Int, $Int], [], false)}, {prop: "fmt_e64", name: "fmt_e64", pkg: "fmt", typ: $funcType([$Float64], [], false)}, {prop: "fmt_E64", name: "fmt_E64", pkg: "fmt", typ: $funcType([$Float64], [], false)}, {prop: "fmt_f64", name: "fmt_f64", pkg: "fmt", typ: $funcType([$Float64], [], false)}, {prop: "fmt_g64", name: "fmt_g64", pkg: "fmt", typ: $funcType([$Float64], [], false)}, {prop: "fmt_G64", name: "fmt_G64", pkg: "fmt", typ: $funcType([$Float64], [], false)}, {prop: "fmt_fb64", name: "fmt_fb64", pkg: "fmt", typ: $funcType([$Float64], [], false)}, {prop: "fmt_e32", name: "fmt_e32", pkg: "fmt", typ: $funcType([$Float32], [], false)}, {prop: "fmt_E32", name: "fmt_E32", pkg: "fmt", typ: $funcType([$Float32], [], false)}, {prop: "fmt_f32", name: "fmt_f32", pkg: "fmt", typ: $funcType([$Float32], [], false)}, {prop: "fmt_g32", name: "fmt_g32", pkg: "fmt", typ: $funcType([$Float32], [], false)}, {prop: "fmt_G32", name: "fmt_G32", pkg: "fmt", typ: $funcType([$Float32], [], false)}, {prop: "fmt_fb32", name: "fmt_fb32", pkg: "fmt", typ: $funcType([$Float32], [], false)}, {prop: "fmt_c64", name: "fmt_c64", pkg: "fmt", typ: $funcType([$Complex64, $Int32], [], false)}, {prop: "fmt_c128", name: "fmt_c128", pkg: "fmt", typ: $funcType([$Complex128, $Int32], [], false)}, {prop: "fmt_complex", name: "fmt_complex", pkg: "fmt", typ: $funcType([$Float64, $Float64, $Int, $Int32], [], false)}];
	ptrType$1.methods = [{prop: "Write", name: "Write", pkg: "", typ: $funcType([sliceType], [$Int, $error], false)}, {prop: "WriteString", name: "WriteString", pkg: "", typ: $funcType([$String], [$Int, $error], false)}, {prop: "WriteByte", name: "WriteByte", pkg: "", typ: $funcType([$Uint8], [$error], false)}, {prop: "WriteRune", name: "WriteRune", pkg: "", typ: $funcType([$Int32], [$error], false)}];
	ptrType.methods = [{prop: "free", name: "free", pkg: "fmt", typ: $funcType([], [], false)}, {prop: "Width", name: "Width", pkg: "", typ: $funcType([], [$Int, $Bool], false)}, {prop: "Precision", name: "Precision", pkg: "", typ: $funcType([], [$Int, $Bool], false)}, {prop: "Flag", name: "Flag", pkg: "", typ: $funcType([$Int], [$Bool], false)}, {prop: "add", name: "add", pkg: "fmt", typ: $funcType([$Int32], [], false)}, {prop: "Write", name: "Write", pkg: "", typ: $funcType([sliceType], [$Int, $error], false)}, {prop: "unknownType", name: "unknownType", pkg: "fmt", typ: $funcType([reflect.Value], [], false)}, {prop: "badVerb", name: "badVerb", pkg: "fmt", typ: $funcType([$Int32], [], false)}, {prop: "fmtBool", name: "fmtBool", pkg: "fmt", typ: $funcType([$Bool, $Int32], [], false)}, {prop: "fmtC", name: "fmtC", pkg: "fmt", typ: $funcType([$Int64], [], false)}, {prop: "fmtInt64", name: "fmtInt64", pkg: "fmt", typ: $funcType([$Int64, $Int32], [], false)}, {prop: "fmt0x64", name: "fmt0x64", pkg: "fmt", typ: $funcType([$Uint64, $Bool], [], false)}, {prop: "fmtUnicode", name: "fmtUnicode", pkg: "fmt", typ: $funcType([$Int64], [], false)}, {prop: "fmtUint64", name: "fmtUint64", pkg: "fmt", typ: $funcType([$Uint64, $Int32], [], false)}, {prop: "fmtFloat32", name: "fmtFloat32", pkg: "fmt", typ: $funcType([$Float32, $Int32], [], false)}, {prop: "fmtFloat64", name: "fmtFloat64", pkg: "fmt", typ: $funcType([$Float64, $Int32], [], false)}, {prop: "fmtComplex64", name: "fmtComplex64", pkg: "fmt", typ: $funcType([$Complex64, $Int32], [], false)}, {prop: "fmtComplex128", name: "fmtComplex128", pkg: "fmt", typ: $funcType([$Complex128, $Int32], [], false)}, {prop: "fmtString", name: "fmtString", pkg: "fmt", typ: $funcType([$String, $Int32], [], false)}, {prop: "fmtBytes", name: "fmtBytes", pkg: "fmt", typ: $funcType([sliceType, $Int32, reflect.Type, $Int], [], false)}, {prop: "fmtPointer", name: "fmtPointer", pkg: "fmt", typ: $funcType([reflect.Value, $Int32], [], false)}, {prop: "catchPanic", name: "catchPanic", pkg: "fmt", typ: $funcType([$emptyInterface, $Int32], [], false)}, {prop: "clearSpecialFlags", name: "clearSpecialFlags", pkg: "fmt", typ: $funcType([], [$Bool, $Bool], false)}, {prop: "restoreSpecialFlags", name: "restoreSpecialFlags", pkg: "fmt", typ: $funcType([$Bool, $Bool], [], false)}, {prop: "handleMethods", name: "handleMethods", pkg: "fmt", typ: $funcType([$Int32, $Int], [$Bool], false)}, {prop: "printArg", name: "printArg", pkg: "fmt", typ: $funcType([$emptyInterface, $Int32, $Int], [$Bool], false)}, {prop: "printValue", name: "printValue", pkg: "fmt", typ: $funcType([reflect.Value, $Int32, $Int], [$Bool], false)}, {prop: "printReflectValue", name: "printReflectValue", pkg: "fmt", typ: $funcType([reflect.Value, $Int32, $Int], [$Bool], false)}, {prop: "argNumber", name: "argNumber", pkg: "fmt", typ: $funcType([$Int, $String, $Int, $Int], [$Int, $Int, $Bool], false)}, {prop: "doPrintf", name: "doPrintf", pkg: "fmt", typ: $funcType([$String, sliceType$1], [], false)}, {prop: "doPrint", name: "doPrint", pkg: "fmt", typ: $funcType([sliceType$1, $Bool, $Bool], [], false)}];
	ptrType$5.methods = [{prop: "Read", name: "Read", pkg: "", typ: $funcType([sliceType], [$Int, $error], false)}, {prop: "ReadRune", name: "ReadRune", pkg: "", typ: $funcType([], [$Int32, $Int, $error], false)}, {prop: "Width", name: "Width", pkg: "", typ: $funcType([], [$Int, $Bool], false)}, {prop: "getRune", name: "getRune", pkg: "fmt", typ: $funcType([], [$Int32], false)}, {prop: "mustReadRune", name: "mustReadRune", pkg: "fmt", typ: $funcType([], [$Int32], false)}, {prop: "UnreadRune", name: "UnreadRune", pkg: "", typ: $funcType([], [$error], false)}, {prop: "error", name: "error", pkg: "fmt", typ: $funcType([$error], [], false)}, {prop: "errorString", name: "errorString", pkg: "fmt", typ: $funcType([$String], [], false)}, {prop: "Token", name: "Token", pkg: "", typ: $funcType([$Bool, funcType], [sliceType, $error], false)}, {prop: "SkipSpace", name: "SkipSpace", pkg: "", typ: $funcType([], [], false)}, {prop: "free", name: "free", pkg: "fmt", typ: $funcType([ssave], [], false)}, {prop: "skipSpace", name: "skipSpace", pkg: "fmt", typ: $funcType([$Bool], [], false)}, {prop: "token", name: "token", pkg: "fmt", typ: $funcType([$Bool, funcType], [sliceType], false)}, {prop: "consume", name: "consume", pkg: "fmt", typ: $funcType([$String, $Bool], [$Bool], false)}, {prop: "peek", name: "peek", pkg: "fmt", typ: $funcType([$String], [$Bool], false)}, {prop: "notEOF", name: "notEOF", pkg: "fmt", typ: $funcType([], [], false)}, {prop: "accept", name: "accept", pkg: "fmt", typ: $funcType([$String], [$Bool], false)}, {prop: "okVerb", name: "okVerb", pkg: "fmt", typ: $funcType([$Int32, $String, $String], [$Bool], false)}, {prop: "scanBool", name: "scanBool", pkg: "fmt", typ: $funcType([$Int32], [$Bool], false)}, {prop: "getBase", name: "getBase", pkg: "fmt", typ: $funcType([$Int32], [$Int, $String], false)}, {prop: "scanNumber", name: "scanNumber", pkg: "fmt", typ: $funcType([$String, $Bool], [$String], false)}, {prop: "scanRune", name: "scanRune", pkg: "fmt", typ: $funcType([$Int], [$Int64], false)}, {prop: "scanBasePrefix", name: "scanBasePrefix", pkg: "fmt", typ: $funcType([], [$Int, $String, $Bool], false)}, {prop: "scanInt", name: "scanInt", pkg: "fmt", typ: $funcType([$Int32, $Int], [$Int64], false)}, {prop: "scanUint", name: "scanUint", pkg: "fmt", typ: $funcType([$Int32, $Int], [$Uint64], false)}, {prop: "floatToken", name: "floatToken", pkg: "fmt", typ: $funcType([], [$String], false)}, {prop: "complexTokens", name: "complexTokens", pkg: "fmt", typ: $funcType([], [$String, $String], false)}, {prop: "convertFloat", name: "convertFloat", pkg: "fmt", typ: $funcType([$String, $Int], [$Float64], false)}, {prop: "scanComplex", name: "scanComplex", pkg: "fmt", typ: $funcType([$Int32, $Int], [$Complex128], false)}, {prop: "convertString", name: "convertString", pkg: "fmt", typ: $funcType([$Int32], [$String], false)}, {prop: "quotedString", name: "quotedString", pkg: "fmt", typ: $funcType([], [$String], false)}, {prop: "hexDigit", name: "hexDigit", pkg: "fmt", typ: $funcType([$Int32], [$Int], false)}, {prop: "hexByte", name: "hexByte", pkg: "fmt", typ: $funcType([], [$Uint8, $Bool], false)}, {prop: "hexString", name: "hexString", pkg: "fmt", typ: $funcType([], [$String], false)}, {prop: "scanOne", name: "scanOne", pkg: "fmt", typ: $funcType([$Int32, $emptyInterface], [], false)}, {prop: "doScan", name: "doScan", pkg: "fmt", typ: $funcType([sliceType$1], [$Int, $error], false)}, {prop: "advance", name: "advance", pkg: "fmt", typ: $funcType([$String], [$Int], false)}, {prop: "doScanf", name: "doScanf", pkg: "fmt", typ: $funcType([$String, sliceType$1], [$Int, $error], false)}];
	fmtFlags.init([{prop: "widPresent", name: "widPresent", pkg: "fmt", typ: $Bool, tag: ""}, {prop: "precPresent", name: "precPresent", pkg: "fmt", typ: $Bool, tag: ""}, {prop: "minus", name: "minus", pkg: "fmt", typ: $Bool, tag: ""}, {prop: "plus", name: "plus", pkg: "fmt", typ: $Bool, tag: ""}, {prop: "sharp", name: "sharp", pkg: "fmt", typ: $Bool, tag: ""}, {prop: "space", name: "space", pkg: "fmt", typ: $Bool, tag: ""}, {prop: "unicode", name: "unicode", pkg: "fmt", typ: $Bool, tag: ""}, {prop: "uniQuote", name: "uniQuote", pkg: "fmt", typ: $Bool, tag: ""}, {prop: "zero", name: "zero", pkg: "fmt", typ: $Bool, tag: ""}, {prop: "plusV", name: "plusV", pkg: "fmt", typ: $Bool, tag: ""}, {prop: "sharpV", name: "sharpV", pkg: "fmt", typ: $Bool, tag: ""}]);
	fmt.init([{prop: "intbuf", name: "intbuf", pkg: "fmt", typ: arrayType$2, tag: ""}, {prop: "buf", name: "buf", pkg: "fmt", typ: ptrType$1, tag: ""}, {prop: "wid", name: "wid", pkg: "fmt", typ: $Int, tag: ""}, {prop: "prec", name: "prec", pkg: "fmt", typ: $Int, tag: ""}, {prop: "fmtFlags", name: "", pkg: "fmt", typ: fmtFlags, tag: ""}]);
	State.init([{prop: "Flag", name: "Flag", pkg: "", typ: $funcType([$Int], [$Bool], false)}, {prop: "Precision", name: "Precision", pkg: "", typ: $funcType([], [$Int, $Bool], false)}, {prop: "Width", name: "Width", pkg: "", typ: $funcType([], [$Int, $Bool], false)}, {prop: "Write", name: "Write", pkg: "", typ: $funcType([sliceType], [$Int, $error], false)}]);
	Formatter.init([{prop: "Format", name: "Format", pkg: "", typ: $funcType([State, $Int32], [], false)}]);
	Stringer.init([{prop: "String", name: "String", pkg: "", typ: $funcType([], [$String], false)}]);
	GoStringer.init([{prop: "GoString", name: "GoString", pkg: "", typ: $funcType([], [$String], false)}]);
	buffer.init($Uint8);
	pp.init([{prop: "n", name: "n", pkg: "fmt", typ: $Int, tag: ""}, {prop: "panicking", name: "panicking", pkg: "fmt", typ: $Bool, tag: ""}, {prop: "erroring", name: "erroring", pkg: "fmt", typ: $Bool, tag: ""}, {prop: "buf", name: "buf", pkg: "fmt", typ: buffer, tag: ""}, {prop: "arg", name: "arg", pkg: "fmt", typ: $emptyInterface, tag: ""}, {prop: "value", name: "value", pkg: "fmt", typ: reflect.Value, tag: ""}, {prop: "reordered", name: "reordered", pkg: "fmt", typ: $Bool, tag: ""}, {prop: "goodArgNum", name: "goodArgNum", pkg: "fmt", typ: $Bool, tag: ""}, {prop: "runeBuf", name: "runeBuf", pkg: "fmt", typ: arrayType$1, tag: ""}, {prop: "fmt", name: "fmt", pkg: "fmt", typ: fmt, tag: ""}]);
	runeUnreader.init([{prop: "UnreadRune", name: "UnreadRune", pkg: "", typ: $funcType([], [$error], false)}]);
	scanError.init([{prop: "err", name: "err", pkg: "fmt", typ: $error, tag: ""}]);
	ss.init([{prop: "rr", name: "rr", pkg: "fmt", typ: io.RuneReader, tag: ""}, {prop: "buf", name: "buf", pkg: "fmt", typ: buffer, tag: ""}, {prop: "peekRune", name: "peekRune", pkg: "fmt", typ: $Int32, tag: ""}, {prop: "prevRune", name: "prevRune", pkg: "fmt", typ: $Int32, tag: ""}, {prop: "count", name: "count", pkg: "fmt", typ: $Int, tag: ""}, {prop: "atEOF", name: "atEOF", pkg: "fmt", typ: $Bool, tag: ""}, {prop: "ssave", name: "", pkg: "fmt", typ: ssave, tag: ""}]);
	ssave.init([{prop: "validSave", name: "validSave", pkg: "fmt", typ: $Bool, tag: ""}, {prop: "nlIsEnd", name: "nlIsEnd", pkg: "fmt", typ: $Bool, tag: ""}, {prop: "nlIsSpace", name: "nlIsSpace", pkg: "fmt", typ: $Bool, tag: ""}, {prop: "argLimit", name: "argLimit", pkg: "fmt", typ: $Int, tag: ""}, {prop: "limit", name: "limit", pkg: "fmt", typ: $Int, tag: ""}, {prop: "maxWid", name: "maxWid", pkg: "fmt", typ: $Int, tag: ""}]);
	$pkg.$init = function() {
		$pkg.$init = function() {};
		/* */ var $r, $s = 0; var $init_fmt = function() { while (true) { switch ($s) { case 0:
		$r = errors.$init($BLOCKING); /* */ $s = 1; case 1: if ($r && $r.$blocking) { $r = $r(); }
		$r = io.$init($BLOCKING); /* */ $s = 2; case 2: if ($r && $r.$blocking) { $r = $r(); }
		$r = math.$init($BLOCKING); /* */ $s = 3; case 3: if ($r && $r.$blocking) { $r = $r(); }
		$r = os.$init($BLOCKING); /* */ $s = 4; case 4: if ($r && $r.$blocking) { $r = $r(); }
		$r = reflect.$init($BLOCKING); /* */ $s = 5; case 5: if ($r && $r.$blocking) { $r = $r(); }
		$r = strconv.$init($BLOCKING); /* */ $s = 6; case 6: if ($r && $r.$blocking) { $r = $r(); }
		$r = sync.$init($BLOCKING); /* */ $s = 7; case 7: if ($r && $r.$blocking) { $r = $r(); }
		$r = utf8.$init($BLOCKING); /* */ $s = 8; case 8: if ($r && $r.$blocking) { $r = $r(); }
		padZeroBytes = $makeSlice(sliceType, 65);
		padSpaceBytes = $makeSlice(sliceType, 65);
		trueBytes = new sliceType($stringToBytes("true"));
		falseBytes = new sliceType($stringToBytes("false"));
		commaSpaceBytes = new sliceType($stringToBytes(", "));
		nilAngleBytes = new sliceType($stringToBytes("<nil>"));
		nilParenBytes = new sliceType($stringToBytes("(nil)"));
		nilBytes = new sliceType($stringToBytes("nil"));
		mapBytes = new sliceType($stringToBytes("map["));
		percentBangBytes = new sliceType($stringToBytes("%!"));
		panicBytes = new sliceType($stringToBytes("(PANIC="));
		irparenBytes = new sliceType($stringToBytes("i)"));
		bytesBytes = new sliceType($stringToBytes("[]byte{"));
		ppFree = new sync.Pool.ptr(0, 0, sliceType$1.nil, (function() {
			return new pp.ptr();
		}));
		intBits = reflect.TypeOf(new $Int(0)).Bits();
		uintptrBits = reflect.TypeOf(new $Uintptr(0)).Bits();
		byteType = reflect.TypeOf(new $Uint8(0));
		space = new sliceType$2([$toNativeArray($kindUint16, [9, 13]), $toNativeArray($kindUint16, [32, 32]), $toNativeArray($kindUint16, [133, 133]), $toNativeArray($kindUint16, [160, 160]), $toNativeArray($kindUint16, [5760, 5760]), $toNativeArray($kindUint16, [8192, 8202]), $toNativeArray($kindUint16, [8232, 8233]), $toNativeArray($kindUint16, [8239, 8239]), $toNativeArray($kindUint16, [8287, 8287]), $toNativeArray($kindUint16, [12288, 12288])]);
		ssFree = new sync.Pool.ptr(0, 0, sliceType$1.nil, (function() {
			return new ss.ptr();
		}));
		complexError = errors.New("syntax error scanning complex number");
		boolError = errors.New("syntax error scanning boolean");
		init();
		/* */ } return; } }; $init_fmt.$blocking = true; return $init_fmt;
	};
	return $pkg;
})();
$packages["main"] = (function() {
	var $pkg = {}, fmt, sliceType, main;
	fmt = $packages["fmt"];
	sliceType = $sliceType($emptyInterface);
	main = function() {
		fmt.Println(new sliceType([new $String("Hello.")]));
	};
	$pkg.$init = function() {
		$pkg.$init = function() {};
		/* */ var $r, $s = 0; var $init_main = function() { while (true) { switch ($s) { case 0:
		$r = fmt.$init($BLOCKING); /* */ $s = 1; case 1: if ($r && $r.$blocking) { $r = $r(); }
		main();
		/* */ } return; } }; $init_main.$blocking = true; return $init_main;
	};
	return $pkg;
})();
$synthesizeMethods();
$packages["runtime"].$init()();
$go($packages["main"].$init, [], true);
$flushConsole();

}).call(this);
//# sourceMappingURL=fmt_simple.js.map
