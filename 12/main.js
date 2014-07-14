"use strict";
(function() {

Error.stackTraceLimit = -1;

var $global, $module;
if (typeof window !== "undefined") { /* web page */
  $global = window;
} else if (typeof self !== "undefined") { /* web worker */
  $global = self;
} else if (typeof global !== "undefined") { /* Node.js */
  $global = global;
  $global.require = require;
} else {
  console.log("warning: no global object found");
}
if (typeof module !== "undefined") {
  $module = module;
}

var $packages = {}, $reflect, $idCounter = 0;
var $keys = function(m) { return m ? Object.keys(m) : []; };
var $min = Math.min;
var $mod = function(x, y) { return x % y; };
var $parseInt = parseInt;
var $parseFloat = function(f) {
  if (f.constructor === Number) {
    return f;
  }
  return parseFloat(f);
};

var $mapArray = function(array, f) {
  var newArray = new array.constructor(array.length), i;
  for (i = 0; i < array.length; i++) {
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
  var array = new Uint8Array(str.length), i;
  for (i = 0; i < str.length; i++) {
    array[i] = str.charCodeAt(i);
  }
  return array;
};

var $bytesToString = function(slice) {
  if (slice.$length === 0) {
    return "";
  }
  var str = "", i;
  for (i = 0; i < slice.$length; i += 10000) {
    str += String.fromCharCode.apply(null, slice.$array.subarray(slice.$offset + i, slice.$offset + Math.min(slice.$length, i + 10000)));
  }
  return str;
};

var $stringToRunes = function(str) {
  var array = new Int32Array(str.length);
  var rune, i, j = 0;
  for (i = 0; i < str.length; i += rune[1], j++) {
    rune = $decodeRune(str, i);
    array[j] = rune[0];
  }
  return array.subarray(0, j);
};

var $runesToString = function(slice) {
  if (slice.$length === 0) {
    return "";
  }
  var str = "", i;
  for (i = 0; i < slice.$length; i++) {
    str += $encodeRune(slice.$array[slice.$offset + i]);
  }
  return str;
};

var $copyString = function(dst, src) {
  var n = Math.min(src.length, dst.$length), i;
  for (i = 0; i < n; i++) {
    dst.$array[dst.$offset + i] = src.charCodeAt(i);
  }
  return n;
};

var $copySlice = function(dst, src) {
  var n = Math.min(src.$length, dst.$length), i;
  $internalCopy(dst.$array, src.$array, dst.$offset, src.$offset, n, dst.constructor.elem);
  return n;
};

var $copy = function(dst, src, type) {
  var i;
  switch (type.kind) {
  case "Array":
    $internalCopy(dst, src, 0, 0, src.length, type.elem);
    return true;
  case "Struct":
    for (i = 0; i < type.fields.length; i++) {
      var field = type.fields[i];
      var name = field[0];
      if (!$copy(dst[name], src[name], field[3])) {
        dst[name] = src[name];
      }
    }
    return true;
  default:
    return false;
  }
};

var $internalCopy = function(dst, src, dstOffset, srcOffset, n, elem) {
  var i;
  if (n === 0) {
    return;
  }

  if (src.subarray) {
    dst.set(src.subarray(srcOffset, srcOffset + n), dstOffset);
    return;
  }

  switch (elem.kind) {
  case "Array":
  case "Struct":
    for (i = 0; i < n; i++) {
      $copy(dst[dstOffset + i], src[srcOffset + i], elem);
    }
    return;
  }

  for (i = 0; i < n; i++) {
    dst[dstOffset + i] = src[srcOffset + i];
  }
};

var $clone = function(src, type) {
  var clone = type.zero();
  $copy(clone, src, type);
  return clone;
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
      var zero = slice.constructor.elem.zero, i;
      for (i = slice.$length; i < newCapacity; i++) {
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
  if (a === b) {
    return true;
  }
  var i;
  switch (type.kind) {
  case "Float32":
    return $float32IsEqual(a, b);
  case "Complex64":
    return $float32IsEqual(a.$real, b.$real) && $float32IsEqual(a.$imag, b.$imag);
  case "Complex128":
    return a.$real === b.$real && a.$imag === b.$imag;
  case "Int64":
  case "Uint64":
    return a.$high === b.$high && a.$low === b.$low;
  case "Ptr":
    if (a.constructor.Struct) {
      return false;
    }
    return $pointerIsEqual(a, b);
  case "Array":
    if (a.length != b.length) {
      return false;
    }
    var i;
    for (i = 0; i < a.length; i++) {
      if (!$equal(a[i], b[i], type.elem)) {
        return false;
      }
    }
    return true;
  case "Struct":
    for (i = 0; i < type.fields.length; i++) {
      var field = type.fields[i];
      var name = field[0];
      if (!$equal(a[name], b[name], field[3])) {
        return false;
      }
    }
    return true;
  default:
    return false;
  }
};

var $interfaceIsEqual = function(a, b) {
  if (a === null || b === null || a === undefined || b === undefined || a.constructor !== b.constructor) {
    return a === b;
  }
  switch (a.constructor.kind) {
  case "Func":
  case "Map":
  case "Slice":
  case "Struct":
    $throwRuntimeError("comparing uncomparable type " + a.constructor.string);
  case undefined: /* js.Object */
    return a === b;
  default:
    return $equal(a.$val, b.$val, a.constructor);
  }
};

var $float32IsEqual = function(a, b) {
  if (a === b) {
    return true;
  }
  if (a === 0 || b === 0 || a === 1/0 || b === 1/0 || a === -1/0 || b === -1/0 || a !== a || b !== b) {
    return false;
  }
  var math = $packages["math"];
  return math !== undefined && math.Float32bits(a) === math.Float32bits(b);
};

var $sliceIsEqual = function(a, ai, b, bi) {
  return a.$array === b.$array && a.$offset + ai === b.$offset + bi;
};

var $pointerIsEqual = function(a, b) {
  if (a === b) {
    return true;
  }
  if (a.$get === $throwNilPointerError || b.$get === $throwNilPointerError) {
    return a.$get === $throwNilPointerError && b.$get === $throwNilPointerError;
  }
  var old = a.$get();
  var dummy = new Object();
  a.$set(dummy);
  var equal = b.$get() === dummy;
  a.$set(old);
  return equal;
};

var $typeAssertionFailed = function(obj, expected) {
  var got = "";
  if (obj !== null) {
    got = obj.constructor.string;
  }
  $panic(new $packages["runtime"].TypeAssertionError.Ptr("", got, expected.string, ""));
};

var $newType = function(size, kind, string, name, pkgPath, constructor) {
  var typ;
  switch(kind) {
  case "Bool":
  case "Int":
  case "Int8":
  case "Int16":
  case "Int32":
  case "Uint":
  case "Uint8" :
  case "Uint16":
  case "Uint32":
  case "Uintptr":
  case "String":
  case "UnsafePointer":
    typ = function(v) { this.$val = v; };
    typ.prototype.$key = function() { return string + "$" + this.$val; };
    break;

  case "Float32":
  case "Float64":
    typ = function(v) { this.$val = v; };
    typ.prototype.$key = function() { return string + "$" + $floatKey(this.$val); };
    break;

  case "Int64":
    typ = function(high, low) {
      this.$high = (high + Math.floor(Math.ceil(low) / 4294967296)) >> 0;
      this.$low = low >>> 0;
      this.$val = this;
    };
    typ.prototype.$key = function() { return string + "$" + this.$high + "$" + this.$low; };
    break;

  case "Uint64":
    typ = function(high, low) {
      this.$high = (high + Math.floor(Math.ceil(low) / 4294967296)) >>> 0;
      this.$low = low >>> 0;
      this.$val = this;
    };
    typ.prototype.$key = function() { return string + "$" + this.$high + "$" + this.$low; };
    break;

  case "Complex64":
  case "Complex128":
    typ = function(real, imag) {
      this.$real = real;
      this.$imag = imag;
      this.$val = this;
    };
    typ.prototype.$key = function() { return string + "$" + this.$real + "$" + this.$imag; };
    break;

  case "Array":
    typ = function(v) { this.$val = v; };
    typ.Ptr = $newType(4, "Ptr", "*" + string, "", "", function(array) {
      this.$get = function() { return array; };
      this.$val = array;
    });
    typ.init = function(elem, len) {
      typ.elem = elem;
      typ.len = len;
      typ.prototype.$key = function() {
        return string + "$" + Array.prototype.join.call($mapArray(this.$val, function(e) {
          var key = e.$key ? e.$key() : String(e);
          return key.replace(/\\/g, "\\\\").replace(/\$/g, "\\$");
        }), "$");
      };
      typ.extendReflectType = function(rt) {
        rt.arrayType = new $reflect.arrayType.Ptr(rt, elem.reflectType(), undefined, len);
      };
      typ.Ptr.init(typ);
      Object.defineProperty(typ.Ptr.nil, "nilCheck", { get: $throwNilPointerError });
    };
    break;

  case "Chan":
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
      typ.nil.$sendQueue = typ.nil.$recvQueue = { length: 0, push: function() {}, shift: function() { return undefined; } };
      typ.extendReflectType = function(rt) {
        rt.chanType = new $reflect.chanType.Ptr(rt, elem.reflectType(), sendOnly ? $reflect.SendDir : (recvOnly ? $reflect.RecvDir : $reflect.BothDir));
      };
    };
    break;

  case "Func":
    typ = function(v) { this.$val = v; };
    typ.init = function(params, results, variadic) {
      typ.params = params;
      typ.results = results;
      typ.variadic = variadic;
      typ.extendReflectType = function(rt) {
        var typeSlice = ($sliceType($ptrType($reflect.rtype.Ptr)));
        rt.funcType = new $reflect.funcType.Ptr(rt, variadic, new typeSlice($mapArray(params, function(p) { return p.reflectType(); })), new typeSlice($mapArray(results, function(p) { return p.reflectType(); })));
      };
    };
    break;

  case "Interface":
    typ = { implementedBy: [] };
    typ.init = function(methods) {
      typ.methods = methods;
      typ.extendReflectType = function(rt) {
        var imethods = $mapArray(methods, function(m) {
          return new $reflect.imethod.Ptr($newStringPtr(m[1]), $newStringPtr(m[2]), $funcType(m[3], m[4], m[5]).reflectType());
        });
        var methodSlice = ($sliceType($ptrType($reflect.imethod.Ptr)));
        rt.interfaceType = new $reflect.interfaceType.Ptr(rt, new methodSlice(imethods));
      };
    };
    break;

  case "Map":
    typ = function(v) { this.$val = v; };
    typ.init = function(key, elem) {
      typ.key = key;
      typ.elem = elem;
      typ.extendReflectType = function(rt) {
        rt.mapType = new $reflect.mapType.Ptr(rt, key.reflectType(), elem.reflectType(), undefined, undefined);
      };
    };
    break;

  case "Ptr":
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
      typ.nil = new typ($throwNilPointerError, $throwNilPointerError);
      typ.extendReflectType = function(rt) {
        rt.ptrType = new $reflect.ptrType.Ptr(rt, elem.reflectType());
      };
    };
    break;

  case "Slice":
    var nativeArray;
    typ = function(array) {
      if (array.constructor !== nativeArray) {
        array = new nativeArray(array);
      }
      this.$array = array;
      this.$offset = 0;
      this.$length = array.length;
      this.$capacity = array.length;
      this.$val = this;
    };
    typ.make = function(length, capacity) {
      capacity = capacity || length;
      var array = new nativeArray(capacity), i;
      if (nativeArray === Array) {
        for (i = 0; i < capacity; i++) {
          array[i] = typ.elem.zero();
        }
      }
      var slice = new typ(array);
      slice.$length = length;
      return slice;
    };
    typ.init = function(elem) {
      typ.elem = elem;
      nativeArray = $nativeArray(elem.kind);
      typ.nil = new typ([]);
      typ.extendReflectType = function(rt) {
        rt.sliceType = new $reflect.sliceType.Ptr(rt, elem.reflectType());
      };
    };
    break;

  case "Struct":
    typ = function(v) { this.$val = v; };
    typ.prototype.$key = function() { $throwRuntimeError("hash of unhashable type " + string); };
    typ.Ptr = $newType(4, "Ptr", "*" + string, "", "", constructor);
    typ.Ptr.Struct = typ;
    typ.Ptr.prototype.$get = function() { return this; };
    typ.init = function(fields) {
      var i;
      typ.fields = fields;
      typ.Ptr.extendReflectType = function(rt) {
        rt.ptrType = new $reflect.ptrType.Ptr(rt, typ.reflectType());
      };
      /* nil value */
      typ.Ptr.nil = Object.create(constructor.prototype);
      typ.Ptr.nil.$val = typ.Ptr.nil;
      for (i = 0; i < fields.length; i++) {
        var field = fields[i];
        Object.defineProperty(typ.Ptr.nil, field[0], { get: $throwNilPointerError, set: $throwNilPointerError });
      }
      /* methods for embedded fields */
      for (i = 0; i < typ.methods.length; i++) {
        var method = typ.methods[i];
        if (method[6] != -1) {
          (function(field, methodName) {
            typ.prototype[methodName] = function() {
              var v = this.$val[field[0]];
              return v[methodName].apply(v, arguments);
            };
          })(fields[method[6]], method[0]);
        }
      }
      for (i = 0; i < typ.Ptr.methods.length; i++) {
        var method = typ.Ptr.methods[i];
        if (method[6] != -1) {
          (function(field, methodName) {
            typ.Ptr.prototype[methodName] = function() {
              var v = this[field[0]];
              if (v.$val === undefined) {
                v = new field[3](v);
              }
              return v[methodName].apply(v, arguments);
            };
          })(fields[method[6]], method[0]);
        }
      }
      /* reflect type */
      typ.extendReflectType = function(rt) {
        var reflectFields = new Array(fields.length), i;
        for (i = 0; i < fields.length; i++) {
          var field = fields[i];
          reflectFields[i] = new $reflect.structField.Ptr($newStringPtr(field[1]), $newStringPtr(field[2]), field[3].reflectType(), $newStringPtr(field[4]), i);
        }
        rt.structType = new $reflect.structType.Ptr(rt, new ($sliceType($reflect.structField.Ptr))(reflectFields));
      };
    };
    break;

  default:
    $panic(new $String("invalid kind: " + kind));
  }

  switch(kind) {
  case "Bool":
  case "Map":
    typ.zero = function() { return false; };
    break;

  case "Int":
  case "Int8":
  case "Int16":
  case "Int32":
  case "Uint":
  case "Uint8" :
  case "Uint16":
  case "Uint32":
  case "Uintptr":
  case "UnsafePointer":
  case "Float32":
  case "Float64":
    typ.zero = function() { return 0; };
    break;

  case "String":
    typ.zero = function() { return ""; };
    break;

  case "Int64":
  case "Uint64":
  case "Complex64":
  case "Complex128":
    var zero = new typ(0, 0);
    typ.zero = function() { return zero; };
    break;

  case "Chan":
  case "Ptr":
  case "Slice":
    typ.zero = function() { return typ.nil; };
    break;

  case "Func":
    typ.zero = function() { return $throwNilPointerError; };
    break;

  case "Interface":
    typ.zero = function() { return null; };
    break;

  case "Array":
    typ.zero = function() {
      var arrayClass = $nativeArray(typ.elem.kind);
      if (arrayClass !== Array) {
        return new arrayClass(typ.len);
      }
      var array = new Array(typ.len), i;
      for (i = 0; i < typ.len; i++) {
        array[i] = typ.elem.zero();
      }
      return array;
    };
    break;

  case "Struct":
    typ.zero = function() { return new typ.Ptr(); };
    break;

  default:
    $panic(new $String("invalid kind: " + kind));
  }

  typ.kind = kind;
  typ.string = string;
  typ.typeName = name;
  typ.pkgPath = pkgPath;
  typ.methods = [];
  var rt = null;
  typ.reflectType = function() {
    if (rt === null) {
      rt = new $reflect.rtype.Ptr(size, 0, 0, 0, 0, $reflect.kinds[kind], undefined, undefined, $newStringPtr(string), undefined, undefined);
      rt.jsType = typ;

      var methods = [];
      if (typ.methods !== undefined) {
        var i;
        for (i = 0; i < typ.methods.length; i++) {
          var m = typ.methods[i];
          methods.push(new $reflect.method.Ptr($newStringPtr(m[1]), $newStringPtr(m[2]), $funcType(m[3], m[4], m[5]).reflectType(), $funcType([typ].concat(m[3]), m[4], m[5]).reflectType(), undefined, undefined));
        }
      }
      if (name !== "" || methods.length !== 0) {
        var methodSlice = ($sliceType($ptrType($reflect.method.Ptr)));
        rt.uncommonType = new $reflect.uncommonType.Ptr($newStringPtr(name), $newStringPtr(pkgPath), new methodSlice(methods));
        rt.uncommonType.jsType = typ;
      }

      if (typ.extendReflectType !== undefined) {
        typ.extendReflectType(rt);
      }
    }
    return rt;
  };
  return typ;
};

var $Bool          = $newType( 1, "Bool",          "bool",           "bool",       "", null);
var $Int           = $newType( 4, "Int",           "int",            "int",        "", null);
var $Int8          = $newType( 1, "Int8",          "int8",           "int8",       "", null);
var $Int16         = $newType( 2, "Int16",         "int16",          "int16",      "", null);
var $Int32         = $newType( 4, "Int32",         "int32",          "int32",      "", null);
var $Int64         = $newType( 8, "Int64",         "int64",          "int64",      "", null);
var $Uint          = $newType( 4, "Uint",          "uint",           "uint",       "", null);
var $Uint8         = $newType( 1, "Uint8",         "uint8",          "uint8",      "", null);
var $Uint16        = $newType( 2, "Uint16",        "uint16",         "uint16",     "", null);
var $Uint32        = $newType( 4, "Uint32",        "uint32",         "uint32",     "", null);
var $Uint64        = $newType( 8, "Uint64",        "uint64",         "uint64",     "", null);
var $Uintptr       = $newType( 4, "Uintptr",       "uintptr",        "uintptr",    "", null);
var $Float32       = $newType( 4, "Float32",       "float32",        "float32",    "", null);
var $Float64       = $newType( 8, "Float64",       "float64",        "float64",    "", null);
var $Complex64     = $newType( 8, "Complex64",     "complex64",      "complex64",  "", null);
var $Complex128    = $newType(16, "Complex128",    "complex128",     "complex128", "", null);
var $String        = $newType( 8, "String",        "string",         "string",     "", null);
var $UnsafePointer = $newType( 4, "UnsafePointer", "unsafe.Pointer", "Pointer",    "", null);

var $nativeArray = function(elemKind) {
  return ({ Int: Int32Array, Int8: Int8Array, Int16: Int16Array, Int32: Int32Array, Uint: Uint32Array, Uint8: Uint8Array, Uint16: Uint16Array, Uint32: Uint32Array, Uintptr: Uint32Array, Float32: Float32Array, Float64: Float64Array })[elemKind] || Array;
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
    typ = $newType(12, "Array", string, "", "", null);
    typ.init(elem, len);
    $arrayTypes[string] = typ;
  }
  return typ;
};

var $chanType = function(elem, sendOnly, recvOnly) {
  var string = (recvOnly ? "<-" : "") + "chan" + (sendOnly ? "<- " : " ") + elem.string;
  var field = sendOnly ? "SendChan" : (recvOnly ? "RecvChan" : "Chan");
  var typ = elem[field];
  if (typ === undefined) {
    typ = $newType(4, "Chan", string, "", "", null);
    typ.init(elem, sendOnly, recvOnly);
    elem[field] = typ;
  }
  return typ;
};

var $funcSig = function(params, results, variadic) {
  var paramTypes = $mapArray(params, function(p) { return p.string; });
  if (variadic) {
    paramTypes[paramTypes.length - 1] = "..." + paramTypes[paramTypes.length - 1].substr(2);
  }
  var string = "(" + paramTypes.join(", ") + ")";
  if (results.length === 1) {
    string += " " + results[0].string;
  } else if (results.length > 1) {
    string += " (" + $mapArray(results, function(r) { return r.string; }).join(", ") + ")";
  }
  return string;
};

var $funcTypes = {};
var $funcType = function(params, results, variadic) {
  var string = "func" + $funcSig(params, results, variadic);
  var typ = $funcTypes[string];
  if (typ === undefined) {
    typ = $newType(4, "Func", string, "", "", null);
    typ.init(params, results, variadic);
    $funcTypes[string] = typ;
  }
  return typ;
};

var $interfaceTypes = {};
var $interfaceType = function(methods) {
  var string = "interface {}";
  if (methods.length !== 0) {
    string = "interface { " + $mapArray(methods, function(m) {
      return (m[2] !== "" ? m[2] + "." : "") + m[1] + $funcSig(m[3], m[4], m[5]);
    }).join("; ") + " }";
  }
  var typ = $interfaceTypes[string];
  if (typ === undefined) {
    typ = $newType(8, "Interface", string, "", "", null);
    typ.init(methods);
    $interfaceTypes[string] = typ;
  }
  return typ;
};
var $emptyInterface = $interfaceType([]);
var $interfaceNil = { $key: function() { return "nil"; } };
var $error = $newType(8, "Interface", "error", "error", "", null);
$error.init([["Error", "Error", "", [], [$String], false]]);

var $Map = function() {};
(function() {
  var names = Object.getOwnPropertyNames(Object.prototype), i;
  for (i = 0; i < names.length; i++) {
    $Map.prototype[names[i]] = undefined;
  }
})();
var $mapTypes = {};
var $mapType = function(key, elem) {
  var string = "map[" + key.string + "]" + elem.string;
  var typ = $mapTypes[string];
  if (typ === undefined) {
    typ = $newType(4, "Map", string, "", "", null);
    typ.init(key, elem);
    $mapTypes[string] = typ;
  }
  return typ;
};


var $throwNilPointerError = function() { $throwRuntimeError("invalid memory address or nil pointer dereference"); };
var $ptrType = function(elem) {
  var typ = elem.Ptr;
  if (typ === undefined) {
    typ = $newType(4, "Ptr", "*" + elem.string, "", "", null);
    typ.init(elem);
    elem.Ptr = typ;
  }
  return typ;
};

var $stringPtrMap = new $Map();
var $newStringPtr = function(str) {
  if (str === undefined || str === "") {
    return $ptrType($String).nil;
  }
  var ptr = $stringPtrMap[str];
  if (ptr === undefined) {
    ptr = new ($ptrType($String))(function() { return str; }, function(v) { str = v; });
    $stringPtrMap[str] = ptr;
  }
  return ptr;
};

var $newDataPointer = function(data, constructor) {
  if (constructor.Struct) {
    return data;
  }
  return new constructor(function() { return data; }, function(v) { data = v; });
};

var $sliceType = function(elem) {
  var typ = elem.Slice;
  if (typ === undefined) {
    typ = $newType(12, "Slice", "[]" + elem.string, "", "", null);
    typ.init(elem);
    elem.Slice = typ;
  }
  return typ;
};

var $structTypes = {};
var $structType = function(fields) {
  var string = "struct { " + $mapArray(fields, function(f) {
    return f[1] + " " + f[3].string + (f[4] !== "" ? (" \"" + f[4].replace(/\\/g, "\\\\").replace(/"/g, "\\\"") + "\"") : "");
  }).join("; ") + " }";
  if (fields.length === 0) {
    string = "struct {}";
  }
  var typ = $structTypes[string];
  if (typ === undefined) {
    typ = $newType(0, "Struct", string, "", "", function() {
      this.$val = this;
      var i;
      for (i = 0; i < fields.length; i++) {
        var field = fields[i];
        var arg = arguments[i];
        this[field[0]] = arg !== undefined ? arg : field[3].zero();
      }
    });
    /* collect methods for anonymous fields */
    var i, j;
    for (i = 0; i < fields.length; i++) {
      var field = fields[i];
      if (field[1] === "") {
        var methods = field[3].methods;
        for (j = 0; j < methods.length; j++) {
          var m = methods[j].slice(0, 6).concat([i]);
          typ.methods.push(m);
          typ.Ptr.methods.push(m);
        }
        if (field[3].kind === "Struct") {
          var methods = field[3].Ptr.methods;
          for (j = 0; j < methods.length; j++) {
            typ.Ptr.methods.push(methods[j].slice(0, 6).concat([i]));
          }
        }
      }
    }
    typ.init(fields);
    $structTypes[string] = typ;
  }
  return typ;
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
  var high = 0, low = 0, i;
  if ((y.$low & 1) !== 0) {
    high = x.$high;
    low = x.$low;
  }
  for (i = 1; i < 32; i++) {
    if ((y.$low & 1<<i) !== 0) {
      high += x.$high << i | x.$low >>> (32 - i);
      low += (x.$low << i) >>> 0;
    }
  }
  for (i = 0; i < 32; i++) {
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

  var high = 0, low = 0, n = 0, i;
  while (yHigh < 2147483648 && ((xHigh > yHigh) || (xHigh === yHigh && xLow > yLow))) {
    yHigh = (yHigh << 1 | yLow >>> 31) >>> 0;
    yLow = (yLow << 1) >>> 0;
    n++;
  }
  for (i = 0; i <= n; i++) {
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

var $getStack = function() {
  return (new Error()).stack.split("\n");
};
var $stackDepthOffset = 0;
var $getStackDepth = function() {
  return $stackDepthOffset + $getStack().length;
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

  $stackDepthOffset--;
  var outerPanicStackDepth = $panicStackDepth;
  var outerPanicValue = $panicValue;

  var localPanicValue = $curGoroutine.panicStack.pop();
  if (jsErr) {
    localPanicValue = new $packages["github.com/gopherjs/gopherjs/js"].Error.Ptr(jsErr);
  }
  if (localPanicValue !== undefined) {
    $panicStackDepth = $getStackDepth();
    $panicValue = localPanicValue;
  }

  var call;
  try {
    while (true) {
      if (deferred === null) {
        deferred = $deferFrames[$deferFrames.length - 1 - $skippedDeferFrames];
        if (deferred === undefined) {
          if (localPanicValue.constructor === $String) {
            throw new Error(localPanicValue.$val);
          } else if (localPanicValue.Error !== undefined) {
            throw new Error(localPanicValue.Error());
          } else if (localPanicValue.String !== undefined) {
            throw new Error(localPanicValue.String());
          } else {
            throw new Error(localPanicValue);
          }
        }
      }
      var call = deferred.pop();
      if (call === undefined) {
        if (localPanicValue !== undefined) {
          $skippedDeferFrames++;
          deferred = null;
          continue;
        }
        return;
      }
      var r = call[0].apply(undefined, call[1]);
      if (r && r.constructor === Function) {
        deferred.push([r, []]);
      }

      if (localPanicValue !== undefined && $panicStackDepth === null) {
        throw null; /* error was recovered */
      }
    }
  } finally {
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
  if ($panicStackDepth === null || $panicStackDepth !== $getStackDepth() - 2) {
    return null;
  }
  $panicStackDepth = null;
  return $panicValue;
};
var $nonblockingCall = function() {
  $panic(new $packages["runtime"].NotSupportedError.Ptr("non-blocking call to blocking function (mark call with \"//gopherjs:blocking\" to fix)"));
};
var $throw = function(err) { throw err; };
var $throwRuntimeError; /* set by package "runtime" */

var $dummyGoroutine = { asleep: false, exit: false, panicStack: [] };
var $curGoroutine = $dummyGoroutine, $totalGoroutines = 0, $awakeGoroutines = 0, $checkForDeadlock = true;
var $go = function(fun, args, direct) {
  $totalGoroutines++;
  $awakeGoroutines++;
  args.push(true);
  var goroutine = function() {
    try {
      $curGoroutine = goroutine;
      $skippedDeferFrames = 0;
      $jumpToDefer = false;
      var r = fun.apply(undefined, args);
      if (r !== undefined) {
        fun = r;
        args = [];
        $schedule(goroutine, direct);
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
      if (goroutine.exit) { /* also set by runtime.Goexit() */
        $totalGoroutines--;
        goroutine.asleep = true;
      }
      if (goroutine.asleep) {
        $awakeGoroutines--;
        if ($awakeGoroutines === 0 && $totalGoroutines !== 0 && $checkForDeadlock) {
          $panic(new $String("fatal error: all goroutines are asleep - deadlock!"));
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
    queuedRecv.chanValue = [value, true];
    $schedule(queuedRecv);
    return;
  }
  if (chan.$buffer.length < chan.$capacity) {
    chan.$buffer.push(value);
    return;
  }

  chan.$sendQueue.push([$curGoroutine, value]);
  var blocked = false;
  return function() {
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
};
var $recv = function(chan) {
  var queuedSend = chan.$sendQueue.shift();
  if (queuedSend !== undefined) {
    $schedule(queuedSend[0]);
    chan.$buffer.push(queuedSend[1]);
  }
  var bufferedValue = chan.$buffer.shift();
  if (bufferedValue !== undefined) {
    return [bufferedValue, true];
  }
  if (chan.$closed) {
    return [chan.constructor.elem.zero(), false];
  }

  chan.$recvQueue.push($curGoroutine);
  var blocked = false;
  return function() {
    if (blocked) {
      var value = $curGoroutine.chanValue;
      $curGoroutine.chanValue = undefined;
      return value;
    };
    blocked = true;
    $curGoroutine.asleep = true;
    throw null;
  };
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
    $schedule(queuedSend[0]); /* will panic because of closed channel */
  }
  while (true) {
    var queuedRecv = chan.$recvQueue.shift();
    if (queuedRecv === undefined) {
      break;
    }
    queuedRecv.chanValue = [chan.constructor.elem.zero(), false];
    $schedule(queuedRecv);
  }
};
var $select = function(comms) {
  var ready = [], i;
  var selection = -1;
  for (i = 0; i < comms.length; i++) {
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

  for (i = 0; i < comms.length; i++) {
    var comm = comms[i];
    switch (comm.length) {
    case 1: /* recv */
      comm[0].$recvQueue.push($curGoroutine);
      break;
    case 2: /* send */
      var queueEntry = [$curGoroutine, comm[1]];
      comm.push(queueEntry);
      comm[0].$sendQueue.push(queueEntry);
      break;
    }
  }
  var blocked = false;
  return function() {
    if (blocked) {
      var selection;
      for (i = 0; i < comms.length; i++) {
        var comm = comms[i];
        switch (comm.length) {
        case 1: /* recv */
          var queue = comm[0].$recvQueue;
          var index = queue.indexOf($curGoroutine);
          if (index !== -1) {
            queue.splice(index, 1);
            break;
          }
          var value = $curGoroutine.chanValue;
          $curGoroutine.chanValue = undefined;
          selection = [i, value];
          break;
        case 3: /* send */
          var queue = comm[0].$sendQueue;
          var index = queue.indexOf(comm[2]);
          if (index !== -1) {
            queue.splice(index, 1);
            break;
          }
          if (comm[0].$closed) {
            $throwRuntimeError("send on closed channel");
          }
          selection = [i];
          break;
        }
      }
      return selection;
    };
    blocked = true;
    $curGoroutine.asleep = true;
    throw null;
  };
};

var $needsExternalization = function(t) {
  switch (t.kind) {
    case "Bool":
    case "Int":
    case "Int8":
    case "Int16":
    case "Int32":
    case "Uint":
    case "Uint8":
    case "Uint16":
    case "Uint32":
    case "Uintptr":
    case "Float32":
    case "Float64":
      return false;
    case "Interface":
      return t !== $packages["github.com/gopherjs/gopherjs/js"].Object;
    default:
      return true;
  }
};

var $externalize = function(v, t) {
  switch (t.kind) {
  case "Bool":
  case "Int":
  case "Int8":
  case "Int16":
  case "Int32":
  case "Uint":
  case "Uint8":
  case "Uint16":
  case "Uint32":
  case "Uintptr":
  case "Float32":
  case "Float64":
    return v;
  case "Int64":
  case "Uint64":
    return $flatten64(v);
  case "Array":
    if ($needsExternalization(t.elem)) {
      return $mapArray(v, function(e) { return $externalize(e, t.elem); });
    }
    return v;
  case "Func":
    if (v === $throwNilPointerError) {
      return null;
    }
    if (v.$externalizeWrapper === undefined) {
      $checkForDeadlock = false;
      var convert = false;
      var i;
      for (i = 0; i < t.params.length; i++) {
        convert = convert || (t.params[i] !== $packages["github.com/gopherjs/gopherjs/js"].Object);
      }
      for (i = 0; i < t.results.length; i++) {
        convert = convert || $needsExternalization(t.results[i]);
      }
      if (!convert) {
        return v;
      }
      v.$externalizeWrapper = function() {
        var args = [], i;
        for (i = 0; i < t.params.length; i++) {
          if (t.variadic && i === t.params.length - 1) {
            var vt = t.params[i].elem, varargs = [], j;
            for (j = i; j < arguments.length; j++) {
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
          for (i = 0; i < t.results.length; i++) {
            result[i] = $externalize(result[i], t.results[i]);
          }
          return result;
        }
      };
    }
    return v.$externalizeWrapper;
  case "Interface":
    if (v === null) {
      return null;
    }
    if (t === $packages["github.com/gopherjs/gopherjs/js"].Object || v.constructor.kind === undefined) {
      return v;
    }
    return $externalize(v.$val, v.constructor);
  case "Map":
    var m = {};
    var keys = $keys(v), i;
    for (i = 0; i < keys.length; i++) {
      var entry = v[keys[i]];
      m[$externalize(entry.k, t.key)] = $externalize(entry.v, t.elem);
    }
    return m;
  case "Ptr":
    var o = {}, i;
    for (i = 0; i < t.methods.length; i++) {
      var m = t.methods[i];
      if (m[2] !== "") { /* not exported */
        continue;
      }
      (function(m) {
        o[m[1]] = $externalize(function() {
          return v[m[0]].apply(v, arguments);
        }, $funcType(m[3], m[4], m[5]));
      })(m);
    }
    return o;
  case "Slice":
    if ($needsExternalization(t.elem)) {
      return $mapArray($sliceToArray(v), function(e) { return $externalize(e, t.elem); });
    }
    return $sliceToArray(v);
  case "String":
    var s = "", r, i, j = 0;
    for (i = 0; i < v.length; i += r[1], j++) {
      r = $decodeRune(v, i);
      s += String.fromCharCode(r[0]);
    }
    return s;
  case "Struct":
    var timePkg = $packages["time"];
    if (timePkg && v.constructor === timePkg.Time.Ptr) {
      var milli = $div64(v.UnixNano(), new $Int64(0, 1000000));
      return new Date($flatten64(milli));
    }
    var o = {}, i;
    for (i = 0; i < t.fields.length; i++) {
      var f = t.fields[i];
      if (f[2] !== "") { /* not exported */
        continue;
      }
      o[f[1]] = $externalize(v[f[0]], f[3]);
    }
    return o;
  }
  $panic(new $String("cannot externalize " + t.string));
};

var $internalize = function(v, t, recv) {
  switch (t.kind) {
  case "Bool":
    return !!v;
  case "Int":
    return parseInt(v);
  case "Int8":
    return parseInt(v) << 24 >> 24;
  case "Int16":
    return parseInt(v) << 16 >> 16;
  case "Int32":
    return parseInt(v) >> 0;
  case "Uint":
    return parseInt(v);
  case "Uint8":
    return parseInt(v) << 24 >>> 24;
  case "Uint16":
    return parseInt(v) << 16 >>> 16;
  case "Uint32":
  case "Uintptr":
    return parseInt(v) >>> 0;
  case "Int64":
  case "Uint64":
    return new t(0, v);
  case "Float32":
  case "Float64":
    return parseFloat(v);
  case "Array":
    if (v.length !== t.len) {
      $throwRuntimeError("got array with wrong size from JavaScript native");
    }
    return $mapArray(v, function(e) { return $internalize(e, t.elem); });
  case "Func":
    return function() {
      var args = [], i;
      for (i = 0; i < t.params.length; i++) {
        if (t.variadic && i === t.params.length - 1) {
          var vt = t.params[i].elem, varargs = arguments[i], j;
          for (j = 0; j < varargs.$length; j++) {
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
        for (i = 0; i < t.results.length; i++) {
          result[i] = $internalize(result[i], t.results[i]);
        }
        return result;
      }
    };
  case "Interface":
    if (v === null || t === $packages["github.com/gopherjs/gopherjs/js"].Object) {
      return v;
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
      var funcType = $funcType([$sliceType($emptyInterface)], [$packages["github.com/gopherjs/gopherjs/js"].Object], true);
      return new funcType($internalize(v, funcType));
    case Number:
      return new $Float64(parseFloat(v));
    case String:
      return new $String($internalize(v, $String));
    default:
      var mapType = $mapType($String, $emptyInterface);
      return new mapType($internalize(v, mapType));
    }
  case "Map":
    var m = new $Map();
    var keys = $keys(v), i;
    for (i = 0; i < keys.length; i++) {
      var key = $internalize(keys[i], t.key);
      m[key.$key ? key.$key() : key] = { k: key, v: $internalize(v[keys[i]], t.elem) };
    }
    return m;
  case "Slice":
    return new t($mapArray(v, function(e) { return $internalize(e, t.elem); }));
  case "String":
    v = String(v);
    var s = "", i;
    for (i = 0; i < v.length; i++) {
      s += $encodeRune(v.charCodeAt(i));
    }
    return s;
  default:
    $panic(new $String("cannot internalize " + t.string));
  }
};

$packages["github.com/gopherjs/gopherjs/js"] = (function() {
	var $pkg = {}, Object, Error, init;
	Object = $pkg.Object = $newType(8, "Interface", "js.Object", "Object", "github.com/gopherjs/gopherjs/js", null);
	Error = $pkg.Error = $newType(0, "Struct", "js.Error", "Error", "github.com/gopherjs/gopherjs/js", function(Object_) {
		this.$val = this;
		this.Object = Object_ !== undefined ? Object_ : null;
	});
	Error.Ptr.prototype.Error = function() {
		var err;
		err = this;
		return "JavaScript error: " + $internalize(err.Object.message, $String);
	};
	Error.prototype.Error = function() { return this.$val.Error(); };
	init = function() {
		var e;
		e = new Error.Ptr(null);
	};
	$pkg.$init = function() {
		Object.init([["Bool", "Bool", "", [], [$Bool], false], ["Call", "Call", "", [$String, ($sliceType($emptyInterface))], [Object], true], ["Delete", "Delete", "", [$String], [], false], ["Float", "Float", "", [], [$Float64], false], ["Get", "Get", "", [$String], [Object], false], ["Index", "Index", "", [$Int], [Object], false], ["Int", "Int", "", [], [$Int], false], ["Int64", "Int64", "", [], [$Int64], false], ["Interface", "Interface", "", [], [$emptyInterface], false], ["Invoke", "Invoke", "", [($sliceType($emptyInterface))], [Object], true], ["IsNull", "IsNull", "", [], [$Bool], false], ["IsUndefined", "IsUndefined", "", [], [$Bool], false], ["Length", "Length", "", [], [$Int], false], ["New", "New", "", [($sliceType($emptyInterface))], [Object], true], ["Set", "Set", "", [$String, $emptyInterface], [], false], ["SetIndex", "SetIndex", "", [$Int, $emptyInterface], [], false], ["Str", "Str", "", [], [$String], false], ["Uint64", "Uint64", "", [], [$Uint64], false], ["Unsafe", "Unsafe", "", [], [$Uintptr], false]]);
		Error.methods = [["Bool", "Bool", "", [], [$Bool], false, 0], ["Call", "Call", "", [$String, ($sliceType($emptyInterface))], [Object], true, 0], ["Delete", "Delete", "", [$String], [], false, 0], ["Float", "Float", "", [], [$Float64], false, 0], ["Get", "Get", "", [$String], [Object], false, 0], ["Index", "Index", "", [$Int], [Object], false, 0], ["Int", "Int", "", [], [$Int], false, 0], ["Int64", "Int64", "", [], [$Int64], false, 0], ["Interface", "Interface", "", [], [$emptyInterface], false, 0], ["Invoke", "Invoke", "", [($sliceType($emptyInterface))], [Object], true, 0], ["IsNull", "IsNull", "", [], [$Bool], false, 0], ["IsUndefined", "IsUndefined", "", [], [$Bool], false, 0], ["Length", "Length", "", [], [$Int], false, 0], ["New", "New", "", [($sliceType($emptyInterface))], [Object], true, 0], ["Set", "Set", "", [$String, $emptyInterface], [], false, 0], ["SetIndex", "SetIndex", "", [$Int, $emptyInterface], [], false, 0], ["Str", "Str", "", [], [$String], false, 0], ["Uint64", "Uint64", "", [], [$Uint64], false, 0], ["Unsafe", "Unsafe", "", [], [$Uintptr], false, 0]];
		($ptrType(Error)).methods = [["Bool", "Bool", "", [], [$Bool], false, 0], ["Call", "Call", "", [$String, ($sliceType($emptyInterface))], [Object], true, 0], ["Delete", "Delete", "", [$String], [], false, 0], ["Error", "Error", "", [], [$String], false, -1], ["Float", "Float", "", [], [$Float64], false, 0], ["Get", "Get", "", [$String], [Object], false, 0], ["Index", "Index", "", [$Int], [Object], false, 0], ["Int", "Int", "", [], [$Int], false, 0], ["Int64", "Int64", "", [], [$Int64], false, 0], ["Interface", "Interface", "", [], [$emptyInterface], false, 0], ["Invoke", "Invoke", "", [($sliceType($emptyInterface))], [Object], true, 0], ["IsNull", "IsNull", "", [], [$Bool], false, 0], ["IsUndefined", "IsUndefined", "", [], [$Bool], false, 0], ["Length", "Length", "", [], [$Int], false, 0], ["New", "New", "", [($sliceType($emptyInterface))], [Object], true, 0], ["Set", "Set", "", [$String, $emptyInterface], [], false, 0], ["SetIndex", "SetIndex", "", [$Int, $emptyInterface], [], false, 0], ["Str", "Str", "", [], [$String], false, 0], ["Uint64", "Uint64", "", [], [$Uint64], false, 0], ["Unsafe", "Unsafe", "", [], [$Uintptr], false, 0]];
		Error.init([["Object", "", "", Object, ""]]);
		init();
	};
	return $pkg;
})();
$packages["runtime"] = (function() {
	var $pkg = {}, js = $packages["github.com/gopherjs/gopherjs/js"], NotSupportedError, TypeAssertionError, errorString, MemStats, sizeof_C_MStats, init, init$1;
	NotSupportedError = $pkg.NotSupportedError = $newType(0, "Struct", "runtime.NotSupportedError", "NotSupportedError", "runtime", function(Feature_) {
		this.$val = this;
		this.Feature = Feature_ !== undefined ? Feature_ : "";
	});
	TypeAssertionError = $pkg.TypeAssertionError = $newType(0, "Struct", "runtime.TypeAssertionError", "TypeAssertionError", "runtime", function(interfaceString_, concreteString_, assertedString_, missingMethod_) {
		this.$val = this;
		this.interfaceString = interfaceString_ !== undefined ? interfaceString_ : "";
		this.concreteString = concreteString_ !== undefined ? concreteString_ : "";
		this.assertedString = assertedString_ !== undefined ? assertedString_ : "";
		this.missingMethod = missingMethod_ !== undefined ? missingMethod_ : "";
	});
	errorString = $pkg.errorString = $newType(8, "String", "runtime.errorString", "errorString", "runtime", null);
	MemStats = $pkg.MemStats = $newType(0, "Struct", "runtime.MemStats", "MemStats", "runtime", function(Alloc_, TotalAlloc_, Sys_, Lookups_, Mallocs_, Frees_, HeapAlloc_, HeapSys_, HeapIdle_, HeapInuse_, HeapReleased_, HeapObjects_, StackInuse_, StackSys_, MSpanInuse_, MSpanSys_, MCacheInuse_, MCacheSys_, BuckHashSys_, GCSys_, OtherSys_, NextGC_, LastGC_, PauseTotalNs_, PauseNs_, NumGC_, EnableGC_, DebugGC_, BySize_) {
		this.$val = this;
		this.Alloc = Alloc_ !== undefined ? Alloc_ : new $Uint64(0, 0);
		this.TotalAlloc = TotalAlloc_ !== undefined ? TotalAlloc_ : new $Uint64(0, 0);
		this.Sys = Sys_ !== undefined ? Sys_ : new $Uint64(0, 0);
		this.Lookups = Lookups_ !== undefined ? Lookups_ : new $Uint64(0, 0);
		this.Mallocs = Mallocs_ !== undefined ? Mallocs_ : new $Uint64(0, 0);
		this.Frees = Frees_ !== undefined ? Frees_ : new $Uint64(0, 0);
		this.HeapAlloc = HeapAlloc_ !== undefined ? HeapAlloc_ : new $Uint64(0, 0);
		this.HeapSys = HeapSys_ !== undefined ? HeapSys_ : new $Uint64(0, 0);
		this.HeapIdle = HeapIdle_ !== undefined ? HeapIdle_ : new $Uint64(0, 0);
		this.HeapInuse = HeapInuse_ !== undefined ? HeapInuse_ : new $Uint64(0, 0);
		this.HeapReleased = HeapReleased_ !== undefined ? HeapReleased_ : new $Uint64(0, 0);
		this.HeapObjects = HeapObjects_ !== undefined ? HeapObjects_ : new $Uint64(0, 0);
		this.StackInuse = StackInuse_ !== undefined ? StackInuse_ : new $Uint64(0, 0);
		this.StackSys = StackSys_ !== undefined ? StackSys_ : new $Uint64(0, 0);
		this.MSpanInuse = MSpanInuse_ !== undefined ? MSpanInuse_ : new $Uint64(0, 0);
		this.MSpanSys = MSpanSys_ !== undefined ? MSpanSys_ : new $Uint64(0, 0);
		this.MCacheInuse = MCacheInuse_ !== undefined ? MCacheInuse_ : new $Uint64(0, 0);
		this.MCacheSys = MCacheSys_ !== undefined ? MCacheSys_ : new $Uint64(0, 0);
		this.BuckHashSys = BuckHashSys_ !== undefined ? BuckHashSys_ : new $Uint64(0, 0);
		this.GCSys = GCSys_ !== undefined ? GCSys_ : new $Uint64(0, 0);
		this.OtherSys = OtherSys_ !== undefined ? OtherSys_ : new $Uint64(0, 0);
		this.NextGC = NextGC_ !== undefined ? NextGC_ : new $Uint64(0, 0);
		this.LastGC = LastGC_ !== undefined ? LastGC_ : new $Uint64(0, 0);
		this.PauseTotalNs = PauseTotalNs_ !== undefined ? PauseTotalNs_ : new $Uint64(0, 0);
		this.PauseNs = PauseNs_ !== undefined ? PauseNs_ : ($arrayType($Uint64, 256)).zero();
		this.NumGC = NumGC_ !== undefined ? NumGC_ : 0;
		this.EnableGC = EnableGC_ !== undefined ? EnableGC_ : false;
		this.DebugGC = DebugGC_ !== undefined ? DebugGC_ : false;
		this.BySize = BySize_ !== undefined ? BySize_ : ($arrayType(($structType([["Size", "Size", "", $Uint32, ""], ["Mallocs", "Mallocs", "", $Uint64, ""], ["Frees", "Frees", "", $Uint64, ""]])), 61)).zero();
	});
	NotSupportedError.Ptr.prototype.Error = function() {
		var err;
		err = this;
		return "not supported by GopherJS: " + err.Feature;
	};
	NotSupportedError.prototype.Error = function() { return this.$val.Error(); };
	init = function() {
		var e;
		$throwRuntimeError = $externalize((function(msg) {
			$panic(new errorString(msg));
		}), ($funcType([$String], [], false)));
		e = null;
		e = new TypeAssertionError.Ptr("", "", "", "");
		e = new NotSupportedError.Ptr("");
	};
	TypeAssertionError.Ptr.prototype.RuntimeError = function() {
	};
	TypeAssertionError.prototype.RuntimeError = function() { return this.$val.RuntimeError(); };
	TypeAssertionError.Ptr.prototype.Error = function() {
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
		e = this.$val !== undefined ? this.$val : this;
	};
	$ptrType(errorString).prototype.RuntimeError = function() { return new errorString(this.$get()).RuntimeError(); };
	errorString.prototype.Error = function() {
		var e;
		e = this.$val !== undefined ? this.$val : this;
		return "runtime error: " + e;
	};
	$ptrType(errorString).prototype.Error = function() { return new errorString(this.$get()).Error(); };
	init$1 = function() {
		var memStats;
		memStats = new MemStats.Ptr(); $copy(memStats, new MemStats.Ptr(), MemStats);
		if (!((sizeof_C_MStats === 3712))) {
			console.log(sizeof_C_MStats, 3712);
			$panic(new $String("MStats vs MemStatsType size mismatch"));
		}
	};
	$pkg.$init = function() {
		($ptrType(NotSupportedError)).methods = [["Error", "Error", "", [], [$String], false, -1]];
		NotSupportedError.init([["Feature", "Feature", "", $String, ""]]);
		($ptrType(TypeAssertionError)).methods = [["Error", "Error", "", [], [$String], false, -1], ["RuntimeError", "RuntimeError", "", [], [], false, -1]];
		TypeAssertionError.init([["interfaceString", "interfaceString", "runtime", $String, ""], ["concreteString", "concreteString", "runtime", $String, ""], ["assertedString", "assertedString", "runtime", $String, ""], ["missingMethod", "missingMethod", "runtime", $String, ""]]);
		errorString.methods = [["Error", "Error", "", [], [$String], false, -1], ["RuntimeError", "RuntimeError", "", [], [], false, -1]];
		($ptrType(errorString)).methods = [["Error", "Error", "", [], [$String], false, -1], ["RuntimeError", "RuntimeError", "", [], [], false, -1]];
		MemStats.init([["Alloc", "Alloc", "", $Uint64, ""], ["TotalAlloc", "TotalAlloc", "", $Uint64, ""], ["Sys", "Sys", "", $Uint64, ""], ["Lookups", "Lookups", "", $Uint64, ""], ["Mallocs", "Mallocs", "", $Uint64, ""], ["Frees", "Frees", "", $Uint64, ""], ["HeapAlloc", "HeapAlloc", "", $Uint64, ""], ["HeapSys", "HeapSys", "", $Uint64, ""], ["HeapIdle", "HeapIdle", "", $Uint64, ""], ["HeapInuse", "HeapInuse", "", $Uint64, ""], ["HeapReleased", "HeapReleased", "", $Uint64, ""], ["HeapObjects", "HeapObjects", "", $Uint64, ""], ["StackInuse", "StackInuse", "", $Uint64, ""], ["StackSys", "StackSys", "", $Uint64, ""], ["MSpanInuse", "MSpanInuse", "", $Uint64, ""], ["MSpanSys", "MSpanSys", "", $Uint64, ""], ["MCacheInuse", "MCacheInuse", "", $Uint64, ""], ["MCacheSys", "MCacheSys", "", $Uint64, ""], ["BuckHashSys", "BuckHashSys", "", $Uint64, ""], ["GCSys", "GCSys", "", $Uint64, ""], ["OtherSys", "OtherSys", "", $Uint64, ""], ["NextGC", "NextGC", "", $Uint64, ""], ["LastGC", "LastGC", "", $Uint64, ""], ["PauseTotalNs", "PauseTotalNs", "", $Uint64, ""], ["PauseNs", "PauseNs", "", ($arrayType($Uint64, 256)), ""], ["NumGC", "NumGC", "", $Uint32, ""], ["EnableGC", "EnableGC", "", $Bool, ""], ["DebugGC", "DebugGC", "", $Bool, ""], ["BySize", "BySize", "", ($arrayType(($structType([["Size", "Size", "", $Uint32, ""], ["Mallocs", "Mallocs", "", $Uint64, ""], ["Frees", "Frees", "", $Uint64, ""]])), 61)), ""]]);
		sizeof_C_MStats = 3712;
		init();
		init$1();
	};
	return $pkg;
})();
$packages["errors"] = (function() {
	var $pkg = {}, errorString, New;
	errorString = $pkg.errorString = $newType(0, "Struct", "errors.errorString", "errorString", "errors", function(s_) {
		this.$val = this;
		this.s = s_ !== undefined ? s_ : "";
	});
	New = $pkg.New = function(text) {
		return new errorString.Ptr(text);
	};
	errorString.Ptr.prototype.Error = function() {
		var e;
		e = this;
		return e.s;
	};
	errorString.prototype.Error = function() { return this.$val.Error(); };
	$pkg.$init = function() {
		($ptrType(errorString)).methods = [["Error", "Error", "", [], [$String], false, -1]];
		errorString.init([["s", "s", "errors", $String, ""]]);
	};
	return $pkg;
})();
$packages["github.com/gopherjs/webgl"] = (function() {
	var $pkg = {}, errors = $packages["errors"], js = $packages["github.com/gopherjs/gopherjs/js"], ContextAttributes, Context, DefaultAttributes, NewContext;
	ContextAttributes = $pkg.ContextAttributes = $newType(0, "Struct", "webgl.ContextAttributes", "ContextAttributes", "github.com/gopherjs/webgl", function(Alpha_, Depth_, Stencil_, Antialias_, PremultipliedAlpha_, PreserveDrawingBuffer_) {
		this.$val = this;
		this.Alpha = Alpha_ !== undefined ? Alpha_ : false;
		this.Depth = Depth_ !== undefined ? Depth_ : false;
		this.Stencil = Stencil_ !== undefined ? Stencil_ : false;
		this.Antialias = Antialias_ !== undefined ? Antialias_ : false;
		this.PremultipliedAlpha = PremultipliedAlpha_ !== undefined ? PremultipliedAlpha_ : false;
		this.PreserveDrawingBuffer = PreserveDrawingBuffer_ !== undefined ? PreserveDrawingBuffer_ : false;
	});
	Context = $pkg.Context = $newType(0, "Struct", "webgl.Context", "Context", "github.com/gopherjs/webgl", function(Object_, ARRAY_BUFFER_, ARRAY_BUFFER_BINDING_, ATTACHED_SHADERS_, BACK_, BLEND_, BLEND_COLOR_, BLEND_DST_ALPHA_, BLEND_DST_RGB_, BLEND_EQUATION_, BLEND_EQUATION_ALPHA_, BLEND_EQUATION_RGB_, BLEND_SRC_ALPHA_, BLEND_SRC_RGB_, BLUE_BITS_, BOOL_, BOOL_VEC2_, BOOL_VEC3_, BOOL_VEC4_, BROWSER_DEFAULT_WEBGL_, BUFFER_SIZE_, BUFFER_USAGE_, BYTE_, CCW_, CLAMP_TO_EDGE_, COLOR_ATTACHMENT0_, COLOR_BUFFER_BIT_, COLOR_CLEAR_VALUE_, COLOR_WRITEMASK_, COMPILE_STATUS_, COMPRESSED_TEXTURE_FORMATS_, CONSTANT_ALPHA_, CONSTANT_COLOR_, CONTEXT_LOST_WEBGL_, CULL_FACE_, CULL_FACE_MODE_, CURRENT_PROGRAM_, CURRENT_VERTEX_ATTRIB_, CW_, DECR_, DECR_WRAP_, DELETE_STATUS_, DEPTH_ATTACHMENT_, DEPTH_BITS_, DEPTH_BUFFER_BIT_, DEPTH_CLEAR_VALUE_, DEPTH_COMPONENT_, DEPTH_COMPONENT16_, DEPTH_FUNC_, DEPTH_RANGE_, DEPTH_STENCIL_, DEPTH_STENCIL_ATTACHMENT_, DEPTH_TEST_, DEPTH_WRITEMASK_, DITHER_, DONT_CARE_, DST_ALPHA_, DST_COLOR_, DYNAMIC_DRAW_, ELEMENT_ARRAY_BUFFER_, ELEMENT_ARRAY_BUFFER_BINDING_, EQUAL_, FASTEST_, FLOAT_, FLOAT_MAT2_, FLOAT_MAT3_, FLOAT_MAT4_, FLOAT_VEC2_, FLOAT_VEC3_, FLOAT_VEC4_, FRAGMENT_SHADER_, FRAMEBUFFER_, FRAMEBUFFER_ATTACHMENT_OBJECT_NAME_, FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE_, FRAMEBUFFER_ATTACHMENT_TEXTURE_CUBE_MAP_FACE_, FRAMEBUFFER_ATTACHMENT_TEXTURE_LEVEL_, FRAMEBUFFER_BINDING_, FRAMEBUFFER_COMPLETE_, FRAMEBUFFER_INCOMPLETE_ATTACHMENT_, FRAMEBUFFER_INCOMPLETE_DIMENSIONS_, FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT_, FRAMEBUFFER_UNSUPPORTED_, FRONT_, FRONT_AND_BACK_, FRONT_FACE_, FUNC_ADD_, FUNC_REVERSE_SUBTRACT_, FUNC_SUBTRACT_, GENERATE_MIPMAP_HINT_, GEQUAL_, GREATER_, GREEN_BITS_, HIGH_FLOAT_, HIGH_INT_, INCR_, INCR_WRAP_, INFO_LOG_LENGTH_, INT_, INT_VEC2_, INT_VEC3_, INT_VEC4_, INVALID_ENUM_, INVALID_FRAMEBUFFER_OPERATION_, INVALID_OPERATION_, INVALID_VALUE_, INVERT_, KEEP_, LEQUAL_, LESS_, LINEAR_, LINEAR_MIPMAP_LINEAR_, LINEAR_MIPMAP_NEAREST_, LINES_, LINE_LOOP_, LINE_STRIP_, LINE_WIDTH_, LINK_STATUS_, LOW_FLOAT_, LOW_INT_, LUMINANCE_, LUMINANCE_ALPHA_, MAX_COMBINED_TEXTURE_IMAGE_UNITS_, MAX_CUBE_MAP_TEXTURE_SIZE_, MAX_FRAGMENT_UNIFORM_VECTORS_, MAX_RENDERBUFFER_SIZE_, MAX_TEXTURE_IMAGE_UNITS_, MAX_TEXTURE_SIZE_, MAX_VARYING_VECTORS_, MAX_VERTEX_ATTRIBS_, MAX_VERTEX_TEXTURE_IMAGE_UNITS_, MAX_VERTEX_UNIFORM_VECTORS_, MAX_VIEWPORT_DIMS_, MEDIUM_FLOAT_, MEDIUM_INT_, MIRRORED_REPEAT_, NEAREST_, NEAREST_MIPMAP_LINEAR_, NEAREST_MIPMAP_NEAREST_, NEVER_, NICEST_, NONE_, NOTEQUAL_, NO_ERROR_, NUM_COMPRESSED_TEXTURE_FORMATS_, ONE_, ONE_MINUS_CONSTANT_ALPHA_, ONE_MINUS_CONSTANT_COLOR_, ONE_MINUS_DST_ALPHA_, ONE_MINUS_DST_COLOR_, ONE_MINUS_SRC_ALPHA_, ONE_MINUS_SRC_COLOR_, OUT_OF_MEMORY_, PACK_ALIGNMENT_, POINTS_, POLYGON_OFFSET_FACTOR_, POLYGON_OFFSET_FILL_, POLYGON_OFFSET_UNITS_, RED_BITS_, RENDERBUFFER_, RENDERBUFFER_ALPHA_SIZE_, RENDERBUFFER_BINDING_, RENDERBUFFER_BLUE_SIZE_, RENDERBUFFER_DEPTH_SIZE_, RENDERBUFFER_GREEN_SIZE_, RENDERBUFFER_HEIGHT_, RENDERBUFFER_INTERNAL_FORMAT_, RENDERBUFFER_RED_SIZE_, RENDERBUFFER_STENCIL_SIZE_, RENDERBUFFER_WIDTH_, RENDERER_, REPEAT_, REPLACE_, RGB_, RGB5_A1_, RGB565_, RGBA_, RGBA4_, SAMPLER_2D_, SAMPLER_CUBE_, SAMPLES_, SAMPLE_ALPHA_TO_COVERAGE_, SAMPLE_BUFFERS_, SAMPLE_COVERAGE_, SAMPLE_COVERAGE_INVERT_, SAMPLE_COVERAGE_VALUE_, SCISSOR_BOX_, SCISSOR_TEST_, SHADER_COMPILER_, SHADER_SOURCE_LENGTH_, SHADER_TYPE_, SHADING_LANGUAGE_VERSION_, SHORT_, SRC_ALPHA_, SRC_ALPHA_SATURATE_, SRC_COLOR_, STATIC_DRAW_, STENCIL_ATTACHMENT_, STENCIL_BACK_FAIL_, STENCIL_BACK_FUNC_, STENCIL_BACK_PASS_DEPTH_FAIL_, STENCIL_BACK_PASS_DEPTH_PASS_, STENCIL_BACK_REF_, STENCIL_BACK_VALUE_MASK_, STENCIL_BACK_WRITEMASK_, STENCIL_BITS_, STENCIL_BUFFER_BIT_, STENCIL_CLEAR_VALUE_, STENCIL_FAIL_, STENCIL_FUNC_, STENCIL_INDEX_, STENCIL_INDEX8_, STENCIL_PASS_DEPTH_FAIL_, STENCIL_PASS_DEPTH_PASS_, STENCIL_REF_, STENCIL_TEST_, STENCIL_VALUE_MASK_, STENCIL_WRITEMASK_, STREAM_DRAW_, SUBPIXEL_BITS_, TEXTURE_, TEXTURE0_, TEXTURE1_, TEXTURE2_, TEXTURE3_, TEXTURE4_, TEXTURE5_, TEXTURE6_, TEXTURE7_, TEXTURE8_, TEXTURE9_, TEXTURE10_, TEXTURE11_, TEXTURE12_, TEXTURE13_, TEXTURE14_, TEXTURE15_, TEXTURE16_, TEXTURE17_, TEXTURE18_, TEXTURE19_, TEXTURE20_, TEXTURE21_, TEXTURE22_, TEXTURE23_, TEXTURE24_, TEXTURE25_, TEXTURE26_, TEXTURE27_, TEXTURE28_, TEXTURE29_, TEXTURE30_, TEXTURE31_, TEXTURE_2D_, TEXTURE_BINDING_2D_, TEXTURE_BINDING_CUBE_MAP_, TEXTURE_CUBE_MAP_, TEXTURE_CUBE_MAP_NEGATIVE_X_, TEXTURE_CUBE_MAP_NEGATIVE_Y_, TEXTURE_CUBE_MAP_NEGATIVE_Z_, TEXTURE_CUBE_MAP_POSITIVE_X_, TEXTURE_CUBE_MAP_POSITIVE_Y_, TEXTURE_CUBE_MAP_POSITIVE_Z_, TEXTURE_MAG_FILTER_, TEXTURE_MIN_FILTER_, TEXTURE_WRAP_S_, TEXTURE_WRAP_T_, TRIANGLES_, TRIANGLE_FAN_, TRIANGLE_STRIP_, UNPACK_ALIGNMENT_, UNPACK_COLORSPACE_CONVERSION_WEBGL_, UNPACK_FLIP_Y_WEBGL_, UNPACK_PREMULTIPLY_ALPHA_WEBGL_, UNSIGNED_BYTE_, UNSIGNED_INT_, UNSIGNED_SHORT_, UNSIGNED_SHORT_4_4_4_4_, UNSIGNED_SHORT_5_5_5_1_, UNSIGNED_SHORT_5_6_5_, VALIDATE_STATUS_, VENDOR_, VERSION_, VERTEX_ATTRIB_ARRAY_BUFFER_BINDING_, VERTEX_ATTRIB_ARRAY_ENABLED_, VERTEX_ATTRIB_ARRAY_NORMALIZED_, VERTEX_ATTRIB_ARRAY_POINTER_, VERTEX_ATTRIB_ARRAY_SIZE_, VERTEX_ATTRIB_ARRAY_STRIDE_, VERTEX_ATTRIB_ARRAY_TYPE_, VERTEX_SHADER_, VIEWPORT_, ZERO_) {
		this.$val = this;
		this.Object = Object_ !== undefined ? Object_ : null;
		this.ARRAY_BUFFER = ARRAY_BUFFER_ !== undefined ? ARRAY_BUFFER_ : 0;
		this.ARRAY_BUFFER_BINDING = ARRAY_BUFFER_BINDING_ !== undefined ? ARRAY_BUFFER_BINDING_ : 0;
		this.ATTACHED_SHADERS = ATTACHED_SHADERS_ !== undefined ? ATTACHED_SHADERS_ : 0;
		this.BACK = BACK_ !== undefined ? BACK_ : 0;
		this.BLEND = BLEND_ !== undefined ? BLEND_ : 0;
		this.BLEND_COLOR = BLEND_COLOR_ !== undefined ? BLEND_COLOR_ : 0;
		this.BLEND_DST_ALPHA = BLEND_DST_ALPHA_ !== undefined ? BLEND_DST_ALPHA_ : 0;
		this.BLEND_DST_RGB = BLEND_DST_RGB_ !== undefined ? BLEND_DST_RGB_ : 0;
		this.BLEND_EQUATION = BLEND_EQUATION_ !== undefined ? BLEND_EQUATION_ : 0;
		this.BLEND_EQUATION_ALPHA = BLEND_EQUATION_ALPHA_ !== undefined ? BLEND_EQUATION_ALPHA_ : 0;
		this.BLEND_EQUATION_RGB = BLEND_EQUATION_RGB_ !== undefined ? BLEND_EQUATION_RGB_ : 0;
		this.BLEND_SRC_ALPHA = BLEND_SRC_ALPHA_ !== undefined ? BLEND_SRC_ALPHA_ : 0;
		this.BLEND_SRC_RGB = BLEND_SRC_RGB_ !== undefined ? BLEND_SRC_RGB_ : 0;
		this.BLUE_BITS = BLUE_BITS_ !== undefined ? BLUE_BITS_ : 0;
		this.BOOL = BOOL_ !== undefined ? BOOL_ : 0;
		this.BOOL_VEC2 = BOOL_VEC2_ !== undefined ? BOOL_VEC2_ : 0;
		this.BOOL_VEC3 = BOOL_VEC3_ !== undefined ? BOOL_VEC3_ : 0;
		this.BOOL_VEC4 = BOOL_VEC4_ !== undefined ? BOOL_VEC4_ : 0;
		this.BROWSER_DEFAULT_WEBGL = BROWSER_DEFAULT_WEBGL_ !== undefined ? BROWSER_DEFAULT_WEBGL_ : 0;
		this.BUFFER_SIZE = BUFFER_SIZE_ !== undefined ? BUFFER_SIZE_ : 0;
		this.BUFFER_USAGE = BUFFER_USAGE_ !== undefined ? BUFFER_USAGE_ : 0;
		this.BYTE = BYTE_ !== undefined ? BYTE_ : 0;
		this.CCW = CCW_ !== undefined ? CCW_ : 0;
		this.CLAMP_TO_EDGE = CLAMP_TO_EDGE_ !== undefined ? CLAMP_TO_EDGE_ : 0;
		this.COLOR_ATTACHMENT0 = COLOR_ATTACHMENT0_ !== undefined ? COLOR_ATTACHMENT0_ : 0;
		this.COLOR_BUFFER_BIT = COLOR_BUFFER_BIT_ !== undefined ? COLOR_BUFFER_BIT_ : 0;
		this.COLOR_CLEAR_VALUE = COLOR_CLEAR_VALUE_ !== undefined ? COLOR_CLEAR_VALUE_ : 0;
		this.COLOR_WRITEMASK = COLOR_WRITEMASK_ !== undefined ? COLOR_WRITEMASK_ : 0;
		this.COMPILE_STATUS = COMPILE_STATUS_ !== undefined ? COMPILE_STATUS_ : 0;
		this.COMPRESSED_TEXTURE_FORMATS = COMPRESSED_TEXTURE_FORMATS_ !== undefined ? COMPRESSED_TEXTURE_FORMATS_ : 0;
		this.CONSTANT_ALPHA = CONSTANT_ALPHA_ !== undefined ? CONSTANT_ALPHA_ : 0;
		this.CONSTANT_COLOR = CONSTANT_COLOR_ !== undefined ? CONSTANT_COLOR_ : 0;
		this.CONTEXT_LOST_WEBGL = CONTEXT_LOST_WEBGL_ !== undefined ? CONTEXT_LOST_WEBGL_ : 0;
		this.CULL_FACE = CULL_FACE_ !== undefined ? CULL_FACE_ : 0;
		this.CULL_FACE_MODE = CULL_FACE_MODE_ !== undefined ? CULL_FACE_MODE_ : 0;
		this.CURRENT_PROGRAM = CURRENT_PROGRAM_ !== undefined ? CURRENT_PROGRAM_ : 0;
		this.CURRENT_VERTEX_ATTRIB = CURRENT_VERTEX_ATTRIB_ !== undefined ? CURRENT_VERTEX_ATTRIB_ : 0;
		this.CW = CW_ !== undefined ? CW_ : 0;
		this.DECR = DECR_ !== undefined ? DECR_ : 0;
		this.DECR_WRAP = DECR_WRAP_ !== undefined ? DECR_WRAP_ : 0;
		this.DELETE_STATUS = DELETE_STATUS_ !== undefined ? DELETE_STATUS_ : 0;
		this.DEPTH_ATTACHMENT = DEPTH_ATTACHMENT_ !== undefined ? DEPTH_ATTACHMENT_ : 0;
		this.DEPTH_BITS = DEPTH_BITS_ !== undefined ? DEPTH_BITS_ : 0;
		this.DEPTH_BUFFER_BIT = DEPTH_BUFFER_BIT_ !== undefined ? DEPTH_BUFFER_BIT_ : 0;
		this.DEPTH_CLEAR_VALUE = DEPTH_CLEAR_VALUE_ !== undefined ? DEPTH_CLEAR_VALUE_ : 0;
		this.DEPTH_COMPONENT = DEPTH_COMPONENT_ !== undefined ? DEPTH_COMPONENT_ : 0;
		this.DEPTH_COMPONENT16 = DEPTH_COMPONENT16_ !== undefined ? DEPTH_COMPONENT16_ : 0;
		this.DEPTH_FUNC = DEPTH_FUNC_ !== undefined ? DEPTH_FUNC_ : 0;
		this.DEPTH_RANGE = DEPTH_RANGE_ !== undefined ? DEPTH_RANGE_ : 0;
		this.DEPTH_STENCIL = DEPTH_STENCIL_ !== undefined ? DEPTH_STENCIL_ : 0;
		this.DEPTH_STENCIL_ATTACHMENT = DEPTH_STENCIL_ATTACHMENT_ !== undefined ? DEPTH_STENCIL_ATTACHMENT_ : 0;
		this.DEPTH_TEST = DEPTH_TEST_ !== undefined ? DEPTH_TEST_ : 0;
		this.DEPTH_WRITEMASK = DEPTH_WRITEMASK_ !== undefined ? DEPTH_WRITEMASK_ : 0;
		this.DITHER = DITHER_ !== undefined ? DITHER_ : 0;
		this.DONT_CARE = DONT_CARE_ !== undefined ? DONT_CARE_ : 0;
		this.DST_ALPHA = DST_ALPHA_ !== undefined ? DST_ALPHA_ : 0;
		this.DST_COLOR = DST_COLOR_ !== undefined ? DST_COLOR_ : 0;
		this.DYNAMIC_DRAW = DYNAMIC_DRAW_ !== undefined ? DYNAMIC_DRAW_ : 0;
		this.ELEMENT_ARRAY_BUFFER = ELEMENT_ARRAY_BUFFER_ !== undefined ? ELEMENT_ARRAY_BUFFER_ : 0;
		this.ELEMENT_ARRAY_BUFFER_BINDING = ELEMENT_ARRAY_BUFFER_BINDING_ !== undefined ? ELEMENT_ARRAY_BUFFER_BINDING_ : 0;
		this.EQUAL = EQUAL_ !== undefined ? EQUAL_ : 0;
		this.FASTEST = FASTEST_ !== undefined ? FASTEST_ : 0;
		this.FLOAT = FLOAT_ !== undefined ? FLOAT_ : 0;
		this.FLOAT_MAT2 = FLOAT_MAT2_ !== undefined ? FLOAT_MAT2_ : 0;
		this.FLOAT_MAT3 = FLOAT_MAT3_ !== undefined ? FLOAT_MAT3_ : 0;
		this.FLOAT_MAT4 = FLOAT_MAT4_ !== undefined ? FLOAT_MAT4_ : 0;
		this.FLOAT_VEC2 = FLOAT_VEC2_ !== undefined ? FLOAT_VEC2_ : 0;
		this.FLOAT_VEC3 = FLOAT_VEC3_ !== undefined ? FLOAT_VEC3_ : 0;
		this.FLOAT_VEC4 = FLOAT_VEC4_ !== undefined ? FLOAT_VEC4_ : 0;
		this.FRAGMENT_SHADER = FRAGMENT_SHADER_ !== undefined ? FRAGMENT_SHADER_ : 0;
		this.FRAMEBUFFER = FRAMEBUFFER_ !== undefined ? FRAMEBUFFER_ : 0;
		this.FRAMEBUFFER_ATTACHMENT_OBJECT_NAME = FRAMEBUFFER_ATTACHMENT_OBJECT_NAME_ !== undefined ? FRAMEBUFFER_ATTACHMENT_OBJECT_NAME_ : 0;
		this.FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE = FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE_ !== undefined ? FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE_ : 0;
		this.FRAMEBUFFER_ATTACHMENT_TEXTURE_CUBE_MAP_FACE = FRAMEBUFFER_ATTACHMENT_TEXTURE_CUBE_MAP_FACE_ !== undefined ? FRAMEBUFFER_ATTACHMENT_TEXTURE_CUBE_MAP_FACE_ : 0;
		this.FRAMEBUFFER_ATTACHMENT_TEXTURE_LEVEL = FRAMEBUFFER_ATTACHMENT_TEXTURE_LEVEL_ !== undefined ? FRAMEBUFFER_ATTACHMENT_TEXTURE_LEVEL_ : 0;
		this.FRAMEBUFFER_BINDING = FRAMEBUFFER_BINDING_ !== undefined ? FRAMEBUFFER_BINDING_ : 0;
		this.FRAMEBUFFER_COMPLETE = FRAMEBUFFER_COMPLETE_ !== undefined ? FRAMEBUFFER_COMPLETE_ : 0;
		this.FRAMEBUFFER_INCOMPLETE_ATTACHMENT = FRAMEBUFFER_INCOMPLETE_ATTACHMENT_ !== undefined ? FRAMEBUFFER_INCOMPLETE_ATTACHMENT_ : 0;
		this.FRAMEBUFFER_INCOMPLETE_DIMENSIONS = FRAMEBUFFER_INCOMPLETE_DIMENSIONS_ !== undefined ? FRAMEBUFFER_INCOMPLETE_DIMENSIONS_ : 0;
		this.FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT = FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT_ !== undefined ? FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT_ : 0;
		this.FRAMEBUFFER_UNSUPPORTED = FRAMEBUFFER_UNSUPPORTED_ !== undefined ? FRAMEBUFFER_UNSUPPORTED_ : 0;
		this.FRONT = FRONT_ !== undefined ? FRONT_ : 0;
		this.FRONT_AND_BACK = FRONT_AND_BACK_ !== undefined ? FRONT_AND_BACK_ : 0;
		this.FRONT_FACE = FRONT_FACE_ !== undefined ? FRONT_FACE_ : 0;
		this.FUNC_ADD = FUNC_ADD_ !== undefined ? FUNC_ADD_ : 0;
		this.FUNC_REVERSE_SUBTRACT = FUNC_REVERSE_SUBTRACT_ !== undefined ? FUNC_REVERSE_SUBTRACT_ : 0;
		this.FUNC_SUBTRACT = FUNC_SUBTRACT_ !== undefined ? FUNC_SUBTRACT_ : 0;
		this.GENERATE_MIPMAP_HINT = GENERATE_MIPMAP_HINT_ !== undefined ? GENERATE_MIPMAP_HINT_ : 0;
		this.GEQUAL = GEQUAL_ !== undefined ? GEQUAL_ : 0;
		this.GREATER = GREATER_ !== undefined ? GREATER_ : 0;
		this.GREEN_BITS = GREEN_BITS_ !== undefined ? GREEN_BITS_ : 0;
		this.HIGH_FLOAT = HIGH_FLOAT_ !== undefined ? HIGH_FLOAT_ : 0;
		this.HIGH_INT = HIGH_INT_ !== undefined ? HIGH_INT_ : 0;
		this.INCR = INCR_ !== undefined ? INCR_ : 0;
		this.INCR_WRAP = INCR_WRAP_ !== undefined ? INCR_WRAP_ : 0;
		this.INFO_LOG_LENGTH = INFO_LOG_LENGTH_ !== undefined ? INFO_LOG_LENGTH_ : 0;
		this.INT = INT_ !== undefined ? INT_ : 0;
		this.INT_VEC2 = INT_VEC2_ !== undefined ? INT_VEC2_ : 0;
		this.INT_VEC3 = INT_VEC3_ !== undefined ? INT_VEC3_ : 0;
		this.INT_VEC4 = INT_VEC4_ !== undefined ? INT_VEC4_ : 0;
		this.INVALID_ENUM = INVALID_ENUM_ !== undefined ? INVALID_ENUM_ : 0;
		this.INVALID_FRAMEBUFFER_OPERATION = INVALID_FRAMEBUFFER_OPERATION_ !== undefined ? INVALID_FRAMEBUFFER_OPERATION_ : 0;
		this.INVALID_OPERATION = INVALID_OPERATION_ !== undefined ? INVALID_OPERATION_ : 0;
		this.INVALID_VALUE = INVALID_VALUE_ !== undefined ? INVALID_VALUE_ : 0;
		this.INVERT = INVERT_ !== undefined ? INVERT_ : 0;
		this.KEEP = KEEP_ !== undefined ? KEEP_ : 0;
		this.LEQUAL = LEQUAL_ !== undefined ? LEQUAL_ : 0;
		this.LESS = LESS_ !== undefined ? LESS_ : 0;
		this.LINEAR = LINEAR_ !== undefined ? LINEAR_ : 0;
		this.LINEAR_MIPMAP_LINEAR = LINEAR_MIPMAP_LINEAR_ !== undefined ? LINEAR_MIPMAP_LINEAR_ : 0;
		this.LINEAR_MIPMAP_NEAREST = LINEAR_MIPMAP_NEAREST_ !== undefined ? LINEAR_MIPMAP_NEAREST_ : 0;
		this.LINES = LINES_ !== undefined ? LINES_ : 0;
		this.LINE_LOOP = LINE_LOOP_ !== undefined ? LINE_LOOP_ : 0;
		this.LINE_STRIP = LINE_STRIP_ !== undefined ? LINE_STRIP_ : 0;
		this.LINE_WIDTH = LINE_WIDTH_ !== undefined ? LINE_WIDTH_ : 0;
		this.LINK_STATUS = LINK_STATUS_ !== undefined ? LINK_STATUS_ : 0;
		this.LOW_FLOAT = LOW_FLOAT_ !== undefined ? LOW_FLOAT_ : 0;
		this.LOW_INT = LOW_INT_ !== undefined ? LOW_INT_ : 0;
		this.LUMINANCE = LUMINANCE_ !== undefined ? LUMINANCE_ : 0;
		this.LUMINANCE_ALPHA = LUMINANCE_ALPHA_ !== undefined ? LUMINANCE_ALPHA_ : 0;
		this.MAX_COMBINED_TEXTURE_IMAGE_UNITS = MAX_COMBINED_TEXTURE_IMAGE_UNITS_ !== undefined ? MAX_COMBINED_TEXTURE_IMAGE_UNITS_ : 0;
		this.MAX_CUBE_MAP_TEXTURE_SIZE = MAX_CUBE_MAP_TEXTURE_SIZE_ !== undefined ? MAX_CUBE_MAP_TEXTURE_SIZE_ : 0;
		this.MAX_FRAGMENT_UNIFORM_VECTORS = MAX_FRAGMENT_UNIFORM_VECTORS_ !== undefined ? MAX_FRAGMENT_UNIFORM_VECTORS_ : 0;
		this.MAX_RENDERBUFFER_SIZE = MAX_RENDERBUFFER_SIZE_ !== undefined ? MAX_RENDERBUFFER_SIZE_ : 0;
		this.MAX_TEXTURE_IMAGE_UNITS = MAX_TEXTURE_IMAGE_UNITS_ !== undefined ? MAX_TEXTURE_IMAGE_UNITS_ : 0;
		this.MAX_TEXTURE_SIZE = MAX_TEXTURE_SIZE_ !== undefined ? MAX_TEXTURE_SIZE_ : 0;
		this.MAX_VARYING_VECTORS = MAX_VARYING_VECTORS_ !== undefined ? MAX_VARYING_VECTORS_ : 0;
		this.MAX_VERTEX_ATTRIBS = MAX_VERTEX_ATTRIBS_ !== undefined ? MAX_VERTEX_ATTRIBS_ : 0;
		this.MAX_VERTEX_TEXTURE_IMAGE_UNITS = MAX_VERTEX_TEXTURE_IMAGE_UNITS_ !== undefined ? MAX_VERTEX_TEXTURE_IMAGE_UNITS_ : 0;
		this.MAX_VERTEX_UNIFORM_VECTORS = MAX_VERTEX_UNIFORM_VECTORS_ !== undefined ? MAX_VERTEX_UNIFORM_VECTORS_ : 0;
		this.MAX_VIEWPORT_DIMS = MAX_VIEWPORT_DIMS_ !== undefined ? MAX_VIEWPORT_DIMS_ : 0;
		this.MEDIUM_FLOAT = MEDIUM_FLOAT_ !== undefined ? MEDIUM_FLOAT_ : 0;
		this.MEDIUM_INT = MEDIUM_INT_ !== undefined ? MEDIUM_INT_ : 0;
		this.MIRRORED_REPEAT = MIRRORED_REPEAT_ !== undefined ? MIRRORED_REPEAT_ : 0;
		this.NEAREST = NEAREST_ !== undefined ? NEAREST_ : 0;
		this.NEAREST_MIPMAP_LINEAR = NEAREST_MIPMAP_LINEAR_ !== undefined ? NEAREST_MIPMAP_LINEAR_ : 0;
		this.NEAREST_MIPMAP_NEAREST = NEAREST_MIPMAP_NEAREST_ !== undefined ? NEAREST_MIPMAP_NEAREST_ : 0;
		this.NEVER = NEVER_ !== undefined ? NEVER_ : 0;
		this.NICEST = NICEST_ !== undefined ? NICEST_ : 0;
		this.NONE = NONE_ !== undefined ? NONE_ : 0;
		this.NOTEQUAL = NOTEQUAL_ !== undefined ? NOTEQUAL_ : 0;
		this.NO_ERROR = NO_ERROR_ !== undefined ? NO_ERROR_ : 0;
		this.NUM_COMPRESSED_TEXTURE_FORMATS = NUM_COMPRESSED_TEXTURE_FORMATS_ !== undefined ? NUM_COMPRESSED_TEXTURE_FORMATS_ : 0;
		this.ONE = ONE_ !== undefined ? ONE_ : 0;
		this.ONE_MINUS_CONSTANT_ALPHA = ONE_MINUS_CONSTANT_ALPHA_ !== undefined ? ONE_MINUS_CONSTANT_ALPHA_ : 0;
		this.ONE_MINUS_CONSTANT_COLOR = ONE_MINUS_CONSTANT_COLOR_ !== undefined ? ONE_MINUS_CONSTANT_COLOR_ : 0;
		this.ONE_MINUS_DST_ALPHA = ONE_MINUS_DST_ALPHA_ !== undefined ? ONE_MINUS_DST_ALPHA_ : 0;
		this.ONE_MINUS_DST_COLOR = ONE_MINUS_DST_COLOR_ !== undefined ? ONE_MINUS_DST_COLOR_ : 0;
		this.ONE_MINUS_SRC_ALPHA = ONE_MINUS_SRC_ALPHA_ !== undefined ? ONE_MINUS_SRC_ALPHA_ : 0;
		this.ONE_MINUS_SRC_COLOR = ONE_MINUS_SRC_COLOR_ !== undefined ? ONE_MINUS_SRC_COLOR_ : 0;
		this.OUT_OF_MEMORY = OUT_OF_MEMORY_ !== undefined ? OUT_OF_MEMORY_ : 0;
		this.PACK_ALIGNMENT = PACK_ALIGNMENT_ !== undefined ? PACK_ALIGNMENT_ : 0;
		this.POINTS = POINTS_ !== undefined ? POINTS_ : 0;
		this.POLYGON_OFFSET_FACTOR = POLYGON_OFFSET_FACTOR_ !== undefined ? POLYGON_OFFSET_FACTOR_ : 0;
		this.POLYGON_OFFSET_FILL = POLYGON_OFFSET_FILL_ !== undefined ? POLYGON_OFFSET_FILL_ : 0;
		this.POLYGON_OFFSET_UNITS = POLYGON_OFFSET_UNITS_ !== undefined ? POLYGON_OFFSET_UNITS_ : 0;
		this.RED_BITS = RED_BITS_ !== undefined ? RED_BITS_ : 0;
		this.RENDERBUFFER = RENDERBUFFER_ !== undefined ? RENDERBUFFER_ : 0;
		this.RENDERBUFFER_ALPHA_SIZE = RENDERBUFFER_ALPHA_SIZE_ !== undefined ? RENDERBUFFER_ALPHA_SIZE_ : 0;
		this.RENDERBUFFER_BINDING = RENDERBUFFER_BINDING_ !== undefined ? RENDERBUFFER_BINDING_ : 0;
		this.RENDERBUFFER_BLUE_SIZE = RENDERBUFFER_BLUE_SIZE_ !== undefined ? RENDERBUFFER_BLUE_SIZE_ : 0;
		this.RENDERBUFFER_DEPTH_SIZE = RENDERBUFFER_DEPTH_SIZE_ !== undefined ? RENDERBUFFER_DEPTH_SIZE_ : 0;
		this.RENDERBUFFER_GREEN_SIZE = RENDERBUFFER_GREEN_SIZE_ !== undefined ? RENDERBUFFER_GREEN_SIZE_ : 0;
		this.RENDERBUFFER_HEIGHT = RENDERBUFFER_HEIGHT_ !== undefined ? RENDERBUFFER_HEIGHT_ : 0;
		this.RENDERBUFFER_INTERNAL_FORMAT = RENDERBUFFER_INTERNAL_FORMAT_ !== undefined ? RENDERBUFFER_INTERNAL_FORMAT_ : 0;
		this.RENDERBUFFER_RED_SIZE = RENDERBUFFER_RED_SIZE_ !== undefined ? RENDERBUFFER_RED_SIZE_ : 0;
		this.RENDERBUFFER_STENCIL_SIZE = RENDERBUFFER_STENCIL_SIZE_ !== undefined ? RENDERBUFFER_STENCIL_SIZE_ : 0;
		this.RENDERBUFFER_WIDTH = RENDERBUFFER_WIDTH_ !== undefined ? RENDERBUFFER_WIDTH_ : 0;
		this.RENDERER = RENDERER_ !== undefined ? RENDERER_ : 0;
		this.REPEAT = REPEAT_ !== undefined ? REPEAT_ : 0;
		this.REPLACE = REPLACE_ !== undefined ? REPLACE_ : 0;
		this.RGB = RGB_ !== undefined ? RGB_ : 0;
		this.RGB5_A1 = RGB5_A1_ !== undefined ? RGB5_A1_ : 0;
		this.RGB565 = RGB565_ !== undefined ? RGB565_ : 0;
		this.RGBA = RGBA_ !== undefined ? RGBA_ : 0;
		this.RGBA4 = RGBA4_ !== undefined ? RGBA4_ : 0;
		this.SAMPLER_2D = SAMPLER_2D_ !== undefined ? SAMPLER_2D_ : 0;
		this.SAMPLER_CUBE = SAMPLER_CUBE_ !== undefined ? SAMPLER_CUBE_ : 0;
		this.SAMPLES = SAMPLES_ !== undefined ? SAMPLES_ : 0;
		this.SAMPLE_ALPHA_TO_COVERAGE = SAMPLE_ALPHA_TO_COVERAGE_ !== undefined ? SAMPLE_ALPHA_TO_COVERAGE_ : 0;
		this.SAMPLE_BUFFERS = SAMPLE_BUFFERS_ !== undefined ? SAMPLE_BUFFERS_ : 0;
		this.SAMPLE_COVERAGE = SAMPLE_COVERAGE_ !== undefined ? SAMPLE_COVERAGE_ : 0;
		this.SAMPLE_COVERAGE_INVERT = SAMPLE_COVERAGE_INVERT_ !== undefined ? SAMPLE_COVERAGE_INVERT_ : 0;
		this.SAMPLE_COVERAGE_VALUE = SAMPLE_COVERAGE_VALUE_ !== undefined ? SAMPLE_COVERAGE_VALUE_ : 0;
		this.SCISSOR_BOX = SCISSOR_BOX_ !== undefined ? SCISSOR_BOX_ : 0;
		this.SCISSOR_TEST = SCISSOR_TEST_ !== undefined ? SCISSOR_TEST_ : 0;
		this.SHADER_COMPILER = SHADER_COMPILER_ !== undefined ? SHADER_COMPILER_ : 0;
		this.SHADER_SOURCE_LENGTH = SHADER_SOURCE_LENGTH_ !== undefined ? SHADER_SOURCE_LENGTH_ : 0;
		this.SHADER_TYPE = SHADER_TYPE_ !== undefined ? SHADER_TYPE_ : 0;
		this.SHADING_LANGUAGE_VERSION = SHADING_LANGUAGE_VERSION_ !== undefined ? SHADING_LANGUAGE_VERSION_ : 0;
		this.SHORT = SHORT_ !== undefined ? SHORT_ : 0;
		this.SRC_ALPHA = SRC_ALPHA_ !== undefined ? SRC_ALPHA_ : 0;
		this.SRC_ALPHA_SATURATE = SRC_ALPHA_SATURATE_ !== undefined ? SRC_ALPHA_SATURATE_ : 0;
		this.SRC_COLOR = SRC_COLOR_ !== undefined ? SRC_COLOR_ : 0;
		this.STATIC_DRAW = STATIC_DRAW_ !== undefined ? STATIC_DRAW_ : 0;
		this.STENCIL_ATTACHMENT = STENCIL_ATTACHMENT_ !== undefined ? STENCIL_ATTACHMENT_ : 0;
		this.STENCIL_BACK_FAIL = STENCIL_BACK_FAIL_ !== undefined ? STENCIL_BACK_FAIL_ : 0;
		this.STENCIL_BACK_FUNC = STENCIL_BACK_FUNC_ !== undefined ? STENCIL_BACK_FUNC_ : 0;
		this.STENCIL_BACK_PASS_DEPTH_FAIL = STENCIL_BACK_PASS_DEPTH_FAIL_ !== undefined ? STENCIL_BACK_PASS_DEPTH_FAIL_ : 0;
		this.STENCIL_BACK_PASS_DEPTH_PASS = STENCIL_BACK_PASS_DEPTH_PASS_ !== undefined ? STENCIL_BACK_PASS_DEPTH_PASS_ : 0;
		this.STENCIL_BACK_REF = STENCIL_BACK_REF_ !== undefined ? STENCIL_BACK_REF_ : 0;
		this.STENCIL_BACK_VALUE_MASK = STENCIL_BACK_VALUE_MASK_ !== undefined ? STENCIL_BACK_VALUE_MASK_ : 0;
		this.STENCIL_BACK_WRITEMASK = STENCIL_BACK_WRITEMASK_ !== undefined ? STENCIL_BACK_WRITEMASK_ : 0;
		this.STENCIL_BITS = STENCIL_BITS_ !== undefined ? STENCIL_BITS_ : 0;
		this.STENCIL_BUFFER_BIT = STENCIL_BUFFER_BIT_ !== undefined ? STENCIL_BUFFER_BIT_ : 0;
		this.STENCIL_CLEAR_VALUE = STENCIL_CLEAR_VALUE_ !== undefined ? STENCIL_CLEAR_VALUE_ : 0;
		this.STENCIL_FAIL = STENCIL_FAIL_ !== undefined ? STENCIL_FAIL_ : 0;
		this.STENCIL_FUNC = STENCIL_FUNC_ !== undefined ? STENCIL_FUNC_ : 0;
		this.STENCIL_INDEX = STENCIL_INDEX_ !== undefined ? STENCIL_INDEX_ : 0;
		this.STENCIL_INDEX8 = STENCIL_INDEX8_ !== undefined ? STENCIL_INDEX8_ : 0;
		this.STENCIL_PASS_DEPTH_FAIL = STENCIL_PASS_DEPTH_FAIL_ !== undefined ? STENCIL_PASS_DEPTH_FAIL_ : 0;
		this.STENCIL_PASS_DEPTH_PASS = STENCIL_PASS_DEPTH_PASS_ !== undefined ? STENCIL_PASS_DEPTH_PASS_ : 0;
		this.STENCIL_REF = STENCIL_REF_ !== undefined ? STENCIL_REF_ : 0;
		this.STENCIL_TEST = STENCIL_TEST_ !== undefined ? STENCIL_TEST_ : 0;
		this.STENCIL_VALUE_MASK = STENCIL_VALUE_MASK_ !== undefined ? STENCIL_VALUE_MASK_ : 0;
		this.STENCIL_WRITEMASK = STENCIL_WRITEMASK_ !== undefined ? STENCIL_WRITEMASK_ : 0;
		this.STREAM_DRAW = STREAM_DRAW_ !== undefined ? STREAM_DRAW_ : 0;
		this.SUBPIXEL_BITS = SUBPIXEL_BITS_ !== undefined ? SUBPIXEL_BITS_ : 0;
		this.TEXTURE = TEXTURE_ !== undefined ? TEXTURE_ : 0;
		this.TEXTURE0 = TEXTURE0_ !== undefined ? TEXTURE0_ : 0;
		this.TEXTURE1 = TEXTURE1_ !== undefined ? TEXTURE1_ : 0;
		this.TEXTURE2 = TEXTURE2_ !== undefined ? TEXTURE2_ : 0;
		this.TEXTURE3 = TEXTURE3_ !== undefined ? TEXTURE3_ : 0;
		this.TEXTURE4 = TEXTURE4_ !== undefined ? TEXTURE4_ : 0;
		this.TEXTURE5 = TEXTURE5_ !== undefined ? TEXTURE5_ : 0;
		this.TEXTURE6 = TEXTURE6_ !== undefined ? TEXTURE6_ : 0;
		this.TEXTURE7 = TEXTURE7_ !== undefined ? TEXTURE7_ : 0;
		this.TEXTURE8 = TEXTURE8_ !== undefined ? TEXTURE8_ : 0;
		this.TEXTURE9 = TEXTURE9_ !== undefined ? TEXTURE9_ : 0;
		this.TEXTURE10 = TEXTURE10_ !== undefined ? TEXTURE10_ : 0;
		this.TEXTURE11 = TEXTURE11_ !== undefined ? TEXTURE11_ : 0;
		this.TEXTURE12 = TEXTURE12_ !== undefined ? TEXTURE12_ : 0;
		this.TEXTURE13 = TEXTURE13_ !== undefined ? TEXTURE13_ : 0;
		this.TEXTURE14 = TEXTURE14_ !== undefined ? TEXTURE14_ : 0;
		this.TEXTURE15 = TEXTURE15_ !== undefined ? TEXTURE15_ : 0;
		this.TEXTURE16 = TEXTURE16_ !== undefined ? TEXTURE16_ : 0;
		this.TEXTURE17 = TEXTURE17_ !== undefined ? TEXTURE17_ : 0;
		this.TEXTURE18 = TEXTURE18_ !== undefined ? TEXTURE18_ : 0;
		this.TEXTURE19 = TEXTURE19_ !== undefined ? TEXTURE19_ : 0;
		this.TEXTURE20 = TEXTURE20_ !== undefined ? TEXTURE20_ : 0;
		this.TEXTURE21 = TEXTURE21_ !== undefined ? TEXTURE21_ : 0;
		this.TEXTURE22 = TEXTURE22_ !== undefined ? TEXTURE22_ : 0;
		this.TEXTURE23 = TEXTURE23_ !== undefined ? TEXTURE23_ : 0;
		this.TEXTURE24 = TEXTURE24_ !== undefined ? TEXTURE24_ : 0;
		this.TEXTURE25 = TEXTURE25_ !== undefined ? TEXTURE25_ : 0;
		this.TEXTURE26 = TEXTURE26_ !== undefined ? TEXTURE26_ : 0;
		this.TEXTURE27 = TEXTURE27_ !== undefined ? TEXTURE27_ : 0;
		this.TEXTURE28 = TEXTURE28_ !== undefined ? TEXTURE28_ : 0;
		this.TEXTURE29 = TEXTURE29_ !== undefined ? TEXTURE29_ : 0;
		this.TEXTURE30 = TEXTURE30_ !== undefined ? TEXTURE30_ : 0;
		this.TEXTURE31 = TEXTURE31_ !== undefined ? TEXTURE31_ : 0;
		this.TEXTURE_2D = TEXTURE_2D_ !== undefined ? TEXTURE_2D_ : 0;
		this.TEXTURE_BINDING_2D = TEXTURE_BINDING_2D_ !== undefined ? TEXTURE_BINDING_2D_ : 0;
		this.TEXTURE_BINDING_CUBE_MAP = TEXTURE_BINDING_CUBE_MAP_ !== undefined ? TEXTURE_BINDING_CUBE_MAP_ : 0;
		this.TEXTURE_CUBE_MAP = TEXTURE_CUBE_MAP_ !== undefined ? TEXTURE_CUBE_MAP_ : 0;
		this.TEXTURE_CUBE_MAP_NEGATIVE_X = TEXTURE_CUBE_MAP_NEGATIVE_X_ !== undefined ? TEXTURE_CUBE_MAP_NEGATIVE_X_ : 0;
		this.TEXTURE_CUBE_MAP_NEGATIVE_Y = TEXTURE_CUBE_MAP_NEGATIVE_Y_ !== undefined ? TEXTURE_CUBE_MAP_NEGATIVE_Y_ : 0;
		this.TEXTURE_CUBE_MAP_NEGATIVE_Z = TEXTURE_CUBE_MAP_NEGATIVE_Z_ !== undefined ? TEXTURE_CUBE_MAP_NEGATIVE_Z_ : 0;
		this.TEXTURE_CUBE_MAP_POSITIVE_X = TEXTURE_CUBE_MAP_POSITIVE_X_ !== undefined ? TEXTURE_CUBE_MAP_POSITIVE_X_ : 0;
		this.TEXTURE_CUBE_MAP_POSITIVE_Y = TEXTURE_CUBE_MAP_POSITIVE_Y_ !== undefined ? TEXTURE_CUBE_MAP_POSITIVE_Y_ : 0;
		this.TEXTURE_CUBE_MAP_POSITIVE_Z = TEXTURE_CUBE_MAP_POSITIVE_Z_ !== undefined ? TEXTURE_CUBE_MAP_POSITIVE_Z_ : 0;
		this.TEXTURE_MAG_FILTER = TEXTURE_MAG_FILTER_ !== undefined ? TEXTURE_MAG_FILTER_ : 0;
		this.TEXTURE_MIN_FILTER = TEXTURE_MIN_FILTER_ !== undefined ? TEXTURE_MIN_FILTER_ : 0;
		this.TEXTURE_WRAP_S = TEXTURE_WRAP_S_ !== undefined ? TEXTURE_WRAP_S_ : 0;
		this.TEXTURE_WRAP_T = TEXTURE_WRAP_T_ !== undefined ? TEXTURE_WRAP_T_ : 0;
		this.TRIANGLES = TRIANGLES_ !== undefined ? TRIANGLES_ : 0;
		this.TRIANGLE_FAN = TRIANGLE_FAN_ !== undefined ? TRIANGLE_FAN_ : 0;
		this.TRIANGLE_STRIP = TRIANGLE_STRIP_ !== undefined ? TRIANGLE_STRIP_ : 0;
		this.UNPACK_ALIGNMENT = UNPACK_ALIGNMENT_ !== undefined ? UNPACK_ALIGNMENT_ : 0;
		this.UNPACK_COLORSPACE_CONVERSION_WEBGL = UNPACK_COLORSPACE_CONVERSION_WEBGL_ !== undefined ? UNPACK_COLORSPACE_CONVERSION_WEBGL_ : 0;
		this.UNPACK_FLIP_Y_WEBGL = UNPACK_FLIP_Y_WEBGL_ !== undefined ? UNPACK_FLIP_Y_WEBGL_ : 0;
		this.UNPACK_PREMULTIPLY_ALPHA_WEBGL = UNPACK_PREMULTIPLY_ALPHA_WEBGL_ !== undefined ? UNPACK_PREMULTIPLY_ALPHA_WEBGL_ : 0;
		this.UNSIGNED_BYTE = UNSIGNED_BYTE_ !== undefined ? UNSIGNED_BYTE_ : 0;
		this.UNSIGNED_INT = UNSIGNED_INT_ !== undefined ? UNSIGNED_INT_ : 0;
		this.UNSIGNED_SHORT = UNSIGNED_SHORT_ !== undefined ? UNSIGNED_SHORT_ : 0;
		this.UNSIGNED_SHORT_4_4_4_4 = UNSIGNED_SHORT_4_4_4_4_ !== undefined ? UNSIGNED_SHORT_4_4_4_4_ : 0;
		this.UNSIGNED_SHORT_5_5_5_1 = UNSIGNED_SHORT_5_5_5_1_ !== undefined ? UNSIGNED_SHORT_5_5_5_1_ : 0;
		this.UNSIGNED_SHORT_5_6_5 = UNSIGNED_SHORT_5_6_5_ !== undefined ? UNSIGNED_SHORT_5_6_5_ : 0;
		this.VALIDATE_STATUS = VALIDATE_STATUS_ !== undefined ? VALIDATE_STATUS_ : 0;
		this.VENDOR = VENDOR_ !== undefined ? VENDOR_ : 0;
		this.VERSION = VERSION_ !== undefined ? VERSION_ : 0;
		this.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING = VERTEX_ATTRIB_ARRAY_BUFFER_BINDING_ !== undefined ? VERTEX_ATTRIB_ARRAY_BUFFER_BINDING_ : 0;
		this.VERTEX_ATTRIB_ARRAY_ENABLED = VERTEX_ATTRIB_ARRAY_ENABLED_ !== undefined ? VERTEX_ATTRIB_ARRAY_ENABLED_ : 0;
		this.VERTEX_ATTRIB_ARRAY_NORMALIZED = VERTEX_ATTRIB_ARRAY_NORMALIZED_ !== undefined ? VERTEX_ATTRIB_ARRAY_NORMALIZED_ : 0;
		this.VERTEX_ATTRIB_ARRAY_POINTER = VERTEX_ATTRIB_ARRAY_POINTER_ !== undefined ? VERTEX_ATTRIB_ARRAY_POINTER_ : 0;
		this.VERTEX_ATTRIB_ARRAY_SIZE = VERTEX_ATTRIB_ARRAY_SIZE_ !== undefined ? VERTEX_ATTRIB_ARRAY_SIZE_ : 0;
		this.VERTEX_ATTRIB_ARRAY_STRIDE = VERTEX_ATTRIB_ARRAY_STRIDE_ !== undefined ? VERTEX_ATTRIB_ARRAY_STRIDE_ : 0;
		this.VERTEX_ATTRIB_ARRAY_TYPE = VERTEX_ATTRIB_ARRAY_TYPE_ !== undefined ? VERTEX_ATTRIB_ARRAY_TYPE_ : 0;
		this.VERTEX_SHADER = VERTEX_SHADER_ !== undefined ? VERTEX_SHADER_ : 0;
		this.VIEWPORT = VIEWPORT_ !== undefined ? VIEWPORT_ : 0;
		this.ZERO = ZERO_ !== undefined ? ZERO_ : 0;
	});
	DefaultAttributes = $pkg.DefaultAttributes = function() {
		return new ContextAttributes.Ptr(true, true, false, true, true, false);
	};
	NewContext = $pkg.NewContext = function(canvas, ca) {
		var attrs, _map, _key, gl, ctx;
		if ($global.WebGLRenderingContext === undefined) {
			return [($ptrType(Context)).nil, errors.New("Your browser doesn't appear to support webgl.")];
		}
		if (ca === ($ptrType(ContextAttributes)).nil) {
			ca = DefaultAttributes();
		}
		attrs = (_map = new $Map(), _key = "alpha", _map[_key] = { k: _key, v: ca.Alpha }, _key = "depth", _map[_key] = { k: _key, v: ca.Depth }, _key = "stencil", _map[_key] = { k: _key, v: ca.Stencil }, _key = "antialias", _map[_key] = { k: _key, v: ca.Antialias }, _key = "premultipliedAlpha", _map[_key] = { k: _key, v: ca.PremultipliedAlpha }, _key = "preserveDrawingBuffer", _map[_key] = { k: _key, v: ca.PreserveDrawingBuffer }, _map);
		gl = canvas.getContext($externalize("webgl", $String), $externalize(attrs, ($mapType($String, $Bool))));
		if (gl === null) {
			gl = canvas.getContext($externalize("experimental-webgl", $String), $externalize(attrs, ($mapType($String, $Bool))));
			if (gl === null) {
				return [($ptrType(Context)).nil, errors.New("Creating a webgl context has failed.")];
			}
		}
		ctx = new Context.Ptr();
		ctx.Object = gl;
		return [ctx, null];
	};
	Context.Ptr.prototype.GetContextAttributes = function() {
		var c, ca;
		c = this;
		ca = c.Object.getContextAttributes();
		return new ContextAttributes.Ptr(!!(ca.alpha), !!(ca.depth), !!(ca.stencil), !!(ca.antialias), !!(ca.premultipliedAlpha), !!(ca.preservedDrawingBuffer));
	};
	Context.prototype.GetContextAttributes = function() { return this.$val.GetContextAttributes(); };
	Context.Ptr.prototype.ActiveTexture = function(texture) {
		var c;
		c = this;
		c.Object.activeTexture(texture);
	};
	Context.prototype.ActiveTexture = function(texture) { return this.$val.ActiveTexture(texture); };
	Context.Ptr.prototype.AttachShader = function(program, shader) {
		var c;
		c = this;
		c.Object.attachShader(program, shader);
	};
	Context.prototype.AttachShader = function(program, shader) { return this.$val.AttachShader(program, shader); };
	Context.Ptr.prototype.BindAttribLocation = function(program, index, name) {
		var c;
		c = this;
		c.Object.bindAttribLocation(program, index, $externalize(name, $String));
	};
	Context.prototype.BindAttribLocation = function(program, index, name) { return this.$val.BindAttribLocation(program, index, name); };
	Context.Ptr.prototype.BindBuffer = function(target, buffer) {
		var c;
		c = this;
		c.Object.bindBuffer(target, buffer);
	};
	Context.prototype.BindBuffer = function(target, buffer) { return this.$val.BindBuffer(target, buffer); };
	Context.Ptr.prototype.BindFramebuffer = function(target, framebuffer) {
		var c;
		c = this;
		c.Object.bindFramebuffer(target, framebuffer);
	};
	Context.prototype.BindFramebuffer = function(target, framebuffer) { return this.$val.BindFramebuffer(target, framebuffer); };
	Context.Ptr.prototype.BindRenderbuffer = function(target, renderbuffer) {
		var c;
		c = this;
		c.Object.bindRenderbuffer(target, renderbuffer);
	};
	Context.prototype.BindRenderbuffer = function(target, renderbuffer) { return this.$val.BindRenderbuffer(target, renderbuffer); };
	Context.Ptr.prototype.BindTexture = function(target, texture) {
		var c;
		c = this;
		c.Object.bindTexture(target, texture);
	};
	Context.prototype.BindTexture = function(target, texture) { return this.$val.BindTexture(target, texture); };
	Context.Ptr.prototype.BlendColor = function(r, g, b, a) {
		var c;
		c = this;
		c.Object.blendColor(r, g, b, a);
	};
	Context.prototype.BlendColor = function(r, g, b, a) { return this.$val.BlendColor(r, g, b, a); };
	Context.Ptr.prototype.BlendEquation = function(mode) {
		var c;
		c = this;
		c.Object.blendEquation(mode);
	};
	Context.prototype.BlendEquation = function(mode) { return this.$val.BlendEquation(mode); };
	Context.Ptr.prototype.BlendEquationSeparate = function(modeRGB, modeAlpha) {
		var c;
		c = this;
		c.Object.blendEquationSeparate(modeRGB, modeAlpha);
	};
	Context.prototype.BlendEquationSeparate = function(modeRGB, modeAlpha) { return this.$val.BlendEquationSeparate(modeRGB, modeAlpha); };
	Context.Ptr.prototype.BlendFunc = function(sfactor, dfactor) {
		var c;
		c = this;
		c.Object.blendFunc(sfactor, dfactor);
	};
	Context.prototype.BlendFunc = function(sfactor, dfactor) { return this.$val.BlendFunc(sfactor, dfactor); };
	Context.Ptr.prototype.BlendFuncSeparate = function(srcRGB, dstRGB, srcAlpha, dstAlpha) {
		var c;
		c = this;
		c.Object.blendFuncSeparate(srcRGB, dstRGB, srcAlpha, dstAlpha);
	};
	Context.prototype.BlendFuncSeparate = function(srcRGB, dstRGB, srcAlpha, dstAlpha) { return this.$val.BlendFuncSeparate(srcRGB, dstRGB, srcAlpha, dstAlpha); };
	Context.Ptr.prototype.BufferData = function(target, data, usage) {
		var c;
		c = this;
		c.Object.bufferData(target, data, usage);
	};
	Context.prototype.BufferData = function(target, data, usage) { return this.$val.BufferData(target, data, usage); };
	Context.Ptr.prototype.BufferSubData = function(target, offset, data) {
		var c;
		c = this;
		c.Object.bufferSubData(target, offset, data);
	};
	Context.prototype.BufferSubData = function(target, offset, data) { return this.$val.BufferSubData(target, offset, data); };
	Context.Ptr.prototype.CheckFramebufferStatus = function(target) {
		var c;
		c = this;
		return $parseInt(c.Object.checkFramebufferStatus(target)) >> 0;
	};
	Context.prototype.CheckFramebufferStatus = function(target) { return this.$val.CheckFramebufferStatus(target); };
	Context.Ptr.prototype.Clear = function(flags) {
		var c;
		c = this;
		c.Object.clear(flags);
	};
	Context.prototype.Clear = function(flags) { return this.$val.Clear(flags); };
	Context.Ptr.prototype.ClearColor = function(r, g, b, a) {
		var c;
		c = this;
		c.Object.clearColor(r, g, b, a);
	};
	Context.prototype.ClearColor = function(r, g, b, a) { return this.$val.ClearColor(r, g, b, a); };
	Context.Ptr.prototype.ClearDepth = function(depth) {
		var c;
		c = this;
		c.Object.clearDepth(depth);
	};
	Context.prototype.ClearDepth = function(depth) { return this.$val.ClearDepth(depth); };
	Context.Ptr.prototype.ClearStencil = function(s) {
		var c;
		c = this;
		c.Object.clearStencil(s);
	};
	Context.prototype.ClearStencil = function(s) { return this.$val.ClearStencil(s); };
	Context.Ptr.prototype.ColorMask = function(r, g, b, a) {
		var c;
		c = this;
		c.Object.colorMask($externalize(r, $Bool), $externalize(g, $Bool), $externalize(b, $Bool), $externalize(a, $Bool));
	};
	Context.prototype.ColorMask = function(r, g, b, a) { return this.$val.ColorMask(r, g, b, a); };
	Context.Ptr.prototype.CompileShader = function(shader) {
		var c;
		c = this;
		c.Object.compileShader(shader);
	};
	Context.prototype.CompileShader = function(shader) { return this.$val.CompileShader(shader); };
	Context.Ptr.prototype.CopyTexImage2D = function(target, level, internal, x, y, w, h, border) {
		var c;
		c = this;
		c.Object.copyTexImage2D(target, level, internal, x, y, w, h, border);
	};
	Context.prototype.CopyTexImage2D = function(target, level, internal, x, y, w, h, border) { return this.$val.CopyTexImage2D(target, level, internal, x, y, w, h, border); };
	Context.Ptr.prototype.CopyTexSubImage2D = function(target, level, xoffset, yoffset, x, y, w, h) {
		var c;
		c = this;
		c.Object.copyTexSubImage2D(target, level, xoffset, yoffset, x, y, w, h);
	};
	Context.prototype.CopyTexSubImage2D = function(target, level, xoffset, yoffset, x, y, w, h) { return this.$val.CopyTexSubImage2D(target, level, xoffset, yoffset, x, y, w, h); };
	Context.Ptr.prototype.CreateBuffer = function() {
		var c;
		c = this;
		return c.Object.createBuffer();
	};
	Context.prototype.CreateBuffer = function() { return this.$val.CreateBuffer(); };
	Context.Ptr.prototype.CreateFramebuffer = function() {
		var c;
		c = this;
		return c.Object.createFramebuffer();
	};
	Context.prototype.CreateFramebuffer = function() { return this.$val.CreateFramebuffer(); };
	Context.Ptr.prototype.CreateProgram = function() {
		var c;
		c = this;
		return c.Object.createProgram();
	};
	Context.prototype.CreateProgram = function() { return this.$val.CreateProgram(); };
	Context.Ptr.prototype.CreateRenderbuffer = function() {
		var c;
		c = this;
		return c.Object.createRenderbuffer();
	};
	Context.prototype.CreateRenderbuffer = function() { return this.$val.CreateRenderbuffer(); };
	Context.Ptr.prototype.CreateShader = function(typ) {
		var c;
		c = this;
		return c.Object.createShader(typ);
	};
	Context.prototype.CreateShader = function(typ) { return this.$val.CreateShader(typ); };
	Context.Ptr.prototype.CreateTexture = function() {
		var c;
		c = this;
		return c.Object.createTexture();
	};
	Context.prototype.CreateTexture = function() { return this.$val.CreateTexture(); };
	Context.Ptr.prototype.CullFace = function(mode) {
		var c;
		c = this;
		c.Object.cullFace(mode);
	};
	Context.prototype.CullFace = function(mode) { return this.$val.CullFace(mode); };
	Context.Ptr.prototype.DeleteBuffer = function(buffer) {
		var c;
		c = this;
		c.Object.deleteBuffer(buffer);
	};
	Context.prototype.DeleteBuffer = function(buffer) { return this.$val.DeleteBuffer(buffer); };
	Context.Ptr.prototype.DeleteFramebuffer = function(framebuffer) {
		var c;
		c = this;
		c.Object.deleteFramebuffer(framebuffer);
	};
	Context.prototype.DeleteFramebuffer = function(framebuffer) { return this.$val.DeleteFramebuffer(framebuffer); };
	Context.Ptr.prototype.DeleteProgram = function(program) {
		var c;
		c = this;
		c.Object.deleteProgram(program);
	};
	Context.prototype.DeleteProgram = function(program) { return this.$val.DeleteProgram(program); };
	Context.Ptr.prototype.DeleteRenderbuffer = function(renderbuffer) {
		var c;
		c = this;
		c.Object.deleteRenderbuffer(renderbuffer);
	};
	Context.prototype.DeleteRenderbuffer = function(renderbuffer) { return this.$val.DeleteRenderbuffer(renderbuffer); };
	Context.Ptr.prototype.DeleteShader = function(shader) {
		var c;
		c = this;
		c.Object.deleteShader(shader);
	};
	Context.prototype.DeleteShader = function(shader) { return this.$val.DeleteShader(shader); };
	Context.Ptr.prototype.DeleteTexture = function(texture) {
		var c;
		c = this;
		c.Object.deleteTexture(texture);
	};
	Context.prototype.DeleteTexture = function(texture) { return this.$val.DeleteTexture(texture); };
	Context.Ptr.prototype.DepthFunc = function(fun) {
		var c;
		c = this;
		c.Object.depthFunc(fun);
	};
	Context.prototype.DepthFunc = function(fun) { return this.$val.DepthFunc(fun); };
	Context.Ptr.prototype.DepthMask = function(flag) {
		var c;
		c = this;
		c.Object.depthMask($externalize(flag, $Bool));
	};
	Context.prototype.DepthMask = function(flag) { return this.$val.DepthMask(flag); };
	Context.Ptr.prototype.DepthRange = function(zNear, zFar) {
		var c;
		c = this;
		c.Object.depthRange(zNear, zFar);
	};
	Context.prototype.DepthRange = function(zNear, zFar) { return this.$val.DepthRange(zNear, zFar); };
	Context.Ptr.prototype.DetachShader = function(program, shader) {
		var c;
		c = this;
		c.Object.detachShader(program, shader);
	};
	Context.prototype.DetachShader = function(program, shader) { return this.$val.DetachShader(program, shader); };
	Context.Ptr.prototype.Disable = function(cap) {
		var c;
		c = this;
		c.Object.disable(cap);
	};
	Context.prototype.Disable = function(cap) { return this.$val.Disable(cap); };
	Context.Ptr.prototype.DisableVertexAttribArray = function(index) {
		var c;
		c = this;
		c.Object.disableVertexAttribArray(index);
	};
	Context.prototype.DisableVertexAttribArray = function(index) { return this.$val.DisableVertexAttribArray(index); };
	Context.Ptr.prototype.DrawArrays = function(mode, first, count) {
		var c;
		c = this;
		c.Object.drawArrays(mode, first, count);
	};
	Context.prototype.DrawArrays = function(mode, first, count) { return this.$val.DrawArrays(mode, first, count); };
	Context.Ptr.prototype.DrawElements = function(mode, count, typ, offset) {
		var c;
		c = this;
		c.Object.drawElements(mode, count, typ, offset);
	};
	Context.prototype.DrawElements = function(mode, count, typ, offset) { return this.$val.DrawElements(mode, count, typ, offset); };
	Context.Ptr.prototype.Enable = function(cap) {
		var c;
		c = this;
		c.Object.enable(cap);
	};
	Context.prototype.Enable = function(cap) { return this.$val.Enable(cap); };
	Context.Ptr.prototype.EnableVertexAttribArray = function(index) {
		var c;
		c = this;
		c.Object.enableVertexAttribArray(index);
	};
	Context.prototype.EnableVertexAttribArray = function(index) { return this.$val.EnableVertexAttribArray(index); };
	Context.Ptr.prototype.Finish = function() {
		var c;
		c = this;
		c.Object.finish();
	};
	Context.prototype.Finish = function() { return this.$val.Finish(); };
	Context.Ptr.prototype.Flush = function() {
		var c;
		c = this;
		c.Object.flush();
	};
	Context.prototype.Flush = function() { return this.$val.Flush(); };
	Context.Ptr.prototype.FrameBufferRenderBuffer = function(target, attachment, renderbufferTarget, renderbuffer) {
		var c;
		c = this;
		c.Object.framebufferRenderBuffer(target, attachment, renderbufferTarget, renderbuffer);
	};
	Context.prototype.FrameBufferRenderBuffer = function(target, attachment, renderbufferTarget, renderbuffer) { return this.$val.FrameBufferRenderBuffer(target, attachment, renderbufferTarget, renderbuffer); };
	Context.Ptr.prototype.FramebufferTexture2D = function(target, attachment, textarget, texture, level) {
		var c;
		c = this;
		c.Object.framebufferTexture2D(target, attachment, textarget, texture, level);
	};
	Context.prototype.FramebufferTexture2D = function(target, attachment, textarget, texture, level) { return this.$val.FramebufferTexture2D(target, attachment, textarget, texture, level); };
	Context.Ptr.prototype.FrontFace = function(mode) {
		var c;
		c = this;
		c.Object.frontFace(mode);
	};
	Context.prototype.FrontFace = function(mode) { return this.$val.FrontFace(mode); };
	Context.Ptr.prototype.GenerateMipmap = function(target) {
		var c;
		c = this;
		c.Object.generateMipmap(target);
	};
	Context.prototype.GenerateMipmap = function(target) { return this.$val.GenerateMipmap(target); };
	Context.Ptr.prototype.GetActiveAttrib = function(program, index) {
		var c;
		c = this;
		return c.Object.getActiveAttrib(program, index);
	};
	Context.prototype.GetActiveAttrib = function(program, index) { return this.$val.GetActiveAttrib(program, index); };
	Context.Ptr.prototype.GetActiveUniform = function(program, index) {
		var c;
		c = this;
		return c.Object.getActiveUniform(program, index);
	};
	Context.prototype.GetActiveUniform = function(program, index) { return this.$val.GetActiveUniform(program, index); };
	Context.Ptr.prototype.GetAttachedShaders = function(program) {
		var c, objs, shaders, i;
		c = this;
		objs = c.Object.getAttachedShaders(program);
		shaders = ($sliceType(js.Object)).make($parseInt(objs.length));
		i = 0;
		while (i < $parseInt(objs.length)) {
			(i < 0 || i >= shaders.$length) ? $throwRuntimeError("index out of range") : shaders.$array[shaders.$offset + i] = objs[i];
			i = i + (1) >> 0;
		}
		return shaders;
	};
	Context.prototype.GetAttachedShaders = function(program) { return this.$val.GetAttachedShaders(program); };
	Context.Ptr.prototype.GetAttribLocation = function(program, name) {
		var c;
		c = this;
		return $parseInt(c.Object.getAttribLocation(program, $externalize(name, $String))) >> 0;
	};
	Context.prototype.GetAttribLocation = function(program, name) { return this.$val.GetAttribLocation(program, name); };
	Context.Ptr.prototype.GetBufferParameter = function(target, pname) {
		var c;
		c = this;
		return c.Object.getBufferParameter(target, pname);
	};
	Context.prototype.GetBufferParameter = function(target, pname) { return this.$val.GetBufferParameter(target, pname); };
	Context.Ptr.prototype.GetParameter = function(pname) {
		var c;
		c = this;
		return c.Object.getParameter(pname);
	};
	Context.prototype.GetParameter = function(pname) { return this.$val.GetParameter(pname); };
	Context.Ptr.prototype.GetError = function() {
		var c;
		c = this;
		return $parseInt(c.Object.getError()) >> 0;
	};
	Context.prototype.GetError = function() { return this.$val.GetError(); };
	Context.Ptr.prototype.GetExtension = function(name) {
		var c;
		c = this;
		return c.Object.getExtension($externalize(name, $String));
	};
	Context.prototype.GetExtension = function(name) { return this.$val.GetExtension(name); };
	Context.Ptr.prototype.GetFramebufferAttachmentParameter = function(target, attachment, pname) {
		var c;
		c = this;
		return c.Object.getFramebufferAttachmentParameter(target, attachment, pname);
	};
	Context.prototype.GetFramebufferAttachmentParameter = function(target, attachment, pname) { return this.$val.GetFramebufferAttachmentParameter(target, attachment, pname); };
	Context.Ptr.prototype.GetProgramParameteri = function(program, pname) {
		var c;
		c = this;
		return $parseInt(c.Object.getProgramParameter(program, pname)) >> 0;
	};
	Context.prototype.GetProgramParameteri = function(program, pname) { return this.$val.GetProgramParameteri(program, pname); };
	Context.Ptr.prototype.GetProgramParameterb = function(program, pname) {
		var c;
		c = this;
		return !!(c.Object.getProgramParameter(program, pname));
	};
	Context.prototype.GetProgramParameterb = function(program, pname) { return this.$val.GetProgramParameterb(program, pname); };
	Context.Ptr.prototype.GetProgramInfoLog = function(program) {
		var c;
		c = this;
		return $internalize(c.Object.getProgramInfoLog(program), $String);
	};
	Context.prototype.GetProgramInfoLog = function(program) { return this.$val.GetProgramInfoLog(program); };
	Context.Ptr.prototype.GetRenderbufferParameter = function(target, pname) {
		var c;
		c = this;
		return c.Object.getRenderbufferParameter(target, pname);
	};
	Context.prototype.GetRenderbufferParameter = function(target, pname) { return this.$val.GetRenderbufferParameter(target, pname); };
	Context.Ptr.prototype.GetShaderParameter = function(shader, pname) {
		var c;
		c = this;
		return c.Object.getShaderParameter(shader, pname);
	};
	Context.prototype.GetShaderParameter = function(shader, pname) { return this.$val.GetShaderParameter(shader, pname); };
	Context.Ptr.prototype.GetShaderParameterb = function(shader, pname) {
		var c;
		c = this;
		return !!(c.Object.getShaderParameter(shader, pname));
	};
	Context.prototype.GetShaderParameterb = function(shader, pname) { return this.$val.GetShaderParameterb(shader, pname); };
	Context.Ptr.prototype.GetShaderInfoLog = function(shader) {
		var c;
		c = this;
		return $internalize(c.Object.getShaderInfoLog(shader), $String);
	};
	Context.prototype.GetShaderInfoLog = function(shader) { return this.$val.GetShaderInfoLog(shader); };
	Context.Ptr.prototype.GetShaderSource = function(shader) {
		var c;
		c = this;
		return $internalize(c.Object.getShaderSource(shader), $String);
	};
	Context.prototype.GetShaderSource = function(shader) { return this.$val.GetShaderSource(shader); };
	Context.Ptr.prototype.GetSupportedExtensions = function() {
		var c, ext, extensions, i;
		c = this;
		ext = c.Object.getSupportedExtensions();
		extensions = ($sliceType($String)).make($parseInt(ext.length));
		i = 0;
		while (i < $parseInt(ext.length)) {
			(i < 0 || i >= extensions.$length) ? $throwRuntimeError("index out of range") : extensions.$array[extensions.$offset + i] = $internalize(ext[i], $String);
			i = i + (1) >> 0;
		}
		return extensions;
	};
	Context.prototype.GetSupportedExtensions = function() { return this.$val.GetSupportedExtensions(); };
	Context.Ptr.prototype.GetTexParameter = function(target, pname) {
		var c;
		c = this;
		return c.Object.getTexParameter(target, pname);
	};
	Context.prototype.GetTexParameter = function(target, pname) { return this.$val.GetTexParameter(target, pname); };
	Context.Ptr.prototype.GetUniform = function(program, location) {
		var c;
		c = this;
		return c.Object.getUniform(program, location);
	};
	Context.prototype.GetUniform = function(program, location) { return this.$val.GetUniform(program, location); };
	Context.Ptr.prototype.GetUniformLocation = function(program, name) {
		var c;
		c = this;
		return c.Object.getUniformLocation(program, $externalize(name, $String));
	};
	Context.prototype.GetUniformLocation = function(program, name) { return this.$val.GetUniformLocation(program, name); };
	Context.Ptr.prototype.GetVertexAttrib = function(index, pname) {
		var c;
		c = this;
		return c.Object.getVertexAttrib(index, pname);
	};
	Context.prototype.GetVertexAttrib = function(index, pname) { return this.$val.GetVertexAttrib(index, pname); };
	Context.Ptr.prototype.GetVertexAttribOffset = function(index, pname) {
		var c;
		c = this;
		return $parseInt(c.Object.getVertexAttribOffset(index, pname)) >> 0;
	};
	Context.prototype.GetVertexAttribOffset = function(index, pname) { return this.$val.GetVertexAttribOffset(index, pname); };
	Context.Ptr.prototype.IsBuffer = function(buffer) {
		var c;
		c = this;
		return !!(c.Object.isBuffer(buffer));
	};
	Context.prototype.IsBuffer = function(buffer) { return this.$val.IsBuffer(buffer); };
	Context.Ptr.prototype.IsContextLost = function() {
		var c;
		c = this;
		return !!(c.Object.isContextLost());
	};
	Context.prototype.IsContextLost = function() { return this.$val.IsContextLost(); };
	Context.Ptr.prototype.IsFramebuffer = function(framebuffer) {
		var c;
		c = this;
		return !!(c.Object.isFramebuffer(framebuffer));
	};
	Context.prototype.IsFramebuffer = function(framebuffer) { return this.$val.IsFramebuffer(framebuffer); };
	Context.Ptr.prototype.IsProgram = function(program) {
		var c;
		c = this;
		return !!(c.Object.isProgram(program));
	};
	Context.prototype.IsProgram = function(program) { return this.$val.IsProgram(program); };
	Context.Ptr.prototype.IsRenderbuffer = function(renderbuffer) {
		var c;
		c = this;
		return !!(c.Object.isRenderbuffer(renderbuffer));
	};
	Context.prototype.IsRenderbuffer = function(renderbuffer) { return this.$val.IsRenderbuffer(renderbuffer); };
	Context.Ptr.prototype.IsShader = function(shader) {
		var c;
		c = this;
		return !!(c.Object.isShader(shader));
	};
	Context.prototype.IsShader = function(shader) { return this.$val.IsShader(shader); };
	Context.Ptr.prototype.IsTexture = function(texture) {
		var c;
		c = this;
		return !!(c.Object.isTexture(texture));
	};
	Context.prototype.IsTexture = function(texture) { return this.$val.IsTexture(texture); };
	Context.Ptr.prototype.IsEnabled = function(capability) {
		var c;
		c = this;
		return !!(c.Object.isEnabled(capability));
	};
	Context.prototype.IsEnabled = function(capability) { return this.$val.IsEnabled(capability); };
	Context.Ptr.prototype.LineWidth = function(width) {
		var c;
		c = this;
		c.Object.lineWidth(width);
	};
	Context.prototype.LineWidth = function(width) { return this.$val.LineWidth(width); };
	Context.Ptr.prototype.LinkProgram = function(program) {
		var c;
		c = this;
		c.Object.linkProgram(program);
	};
	Context.prototype.LinkProgram = function(program) { return this.$val.LinkProgram(program); };
	Context.Ptr.prototype.PixelStorei = function(pname, param) {
		var c;
		c = this;
		c.Object.pixelStorei(pname, param);
	};
	Context.prototype.PixelStorei = function(pname, param) { return this.$val.PixelStorei(pname, param); };
	Context.Ptr.prototype.PolygonOffset = function(factor, units) {
		var c;
		c = this;
		c.Object.polygonOffset(factor, units);
	};
	Context.prototype.PolygonOffset = function(factor, units) { return this.$val.PolygonOffset(factor, units); };
	Context.Ptr.prototype.ReadPixels = function(x, y, width, height, format, typ, pixels) {
		var c;
		c = this;
		c.Object.readPixels(x, y, width, height, format, typ, pixels);
	};
	Context.prototype.ReadPixels = function(x, y, width, height, format, typ, pixels) { return this.$val.ReadPixels(x, y, width, height, format, typ, pixels); };
	Context.Ptr.prototype.RenderbufferStorage = function(target, internalFormat, width, height) {
		var c;
		c = this;
		c.Object.renderbufferStorage(target, internalFormat, width, height);
	};
	Context.prototype.RenderbufferStorage = function(target, internalFormat, width, height) { return this.$val.RenderbufferStorage(target, internalFormat, width, height); };
	Context.Ptr.prototype.Scissor = function(x, y, width, height) {
		var c;
		c = this;
		c.Object.scissor(x, y, width, height);
	};
	Context.prototype.Scissor = function(x, y, width, height) { return this.$val.Scissor(x, y, width, height); };
	Context.Ptr.prototype.ShaderSource = function(shader, source) {
		var c;
		c = this;
		c.Object.shaderSource(shader, $externalize(source, $String));
	};
	Context.prototype.ShaderSource = function(shader, source) { return this.$val.ShaderSource(shader, source); };
	Context.Ptr.prototype.TexImage2D = function(target, level, internalFormat, format, kind, image) {
		var c;
		c = this;
		c.Object.texImage2D(target, level, internalFormat, format, kind, image);
	};
	Context.prototype.TexImage2D = function(target, level, internalFormat, format, kind, image) { return this.$val.TexImage2D(target, level, internalFormat, format, kind, image); };
	Context.Ptr.prototype.TexParameteri = function(target, pname, param) {
		var c;
		c = this;
		c.Object.texParameteri(target, pname, param);
	};
	Context.prototype.TexParameteri = function(target, pname, param) { return this.$val.TexParameteri(target, pname, param); };
	Context.Ptr.prototype.TexSubImage2D = function(target, level, xoffset, yoffset, format, typ, image) {
		var c;
		c = this;
		c.Object.texSubImage2D(target, level, xoffset, yoffset, format, typ, image);
	};
	Context.prototype.TexSubImage2D = function(target, level, xoffset, yoffset, format, typ, image) { return this.$val.TexSubImage2D(target, level, xoffset, yoffset, format, typ, image); };
	Context.Ptr.prototype.Uniform1f = function(location, x) {
		var c;
		c = this;
		c.Object.uniform1f(location, x);
	};
	Context.prototype.Uniform1f = function(location, x) { return this.$val.Uniform1f(location, x); };
	Context.Ptr.prototype.Uniform1i = function(location, x) {
		var c;
		c = this;
		c.Object.uniform1i(location, x);
	};
	Context.prototype.Uniform1i = function(location, x) { return this.$val.Uniform1i(location, x); };
	Context.Ptr.prototype.Uniform2f = function(location, x, y) {
		var c;
		c = this;
		c.Object.uniform2f(location, x, y);
	};
	Context.prototype.Uniform2f = function(location, x, y) { return this.$val.Uniform2f(location, x, y); };
	Context.Ptr.prototype.Uniform2i = function(location, x, y) {
		var c;
		c = this;
		c.Object.uniform2i(location, x, y);
	};
	Context.prototype.Uniform2i = function(location, x, y) { return this.$val.Uniform2i(location, x, y); };
	Context.Ptr.prototype.Uniform3f = function(location, x, y, z) {
		var c;
		c = this;
		c.Object.uniform3f(location, x, y, z);
	};
	Context.prototype.Uniform3f = function(location, x, y, z) { return this.$val.Uniform3f(location, x, y, z); };
	Context.Ptr.prototype.Uniform3i = function(location, x, y, z) {
		var c;
		c = this;
		c.Object.uniform3i(location, x, y, z);
	};
	Context.prototype.Uniform3i = function(location, x, y, z) { return this.$val.Uniform3i(location, x, y, z); };
	Context.Ptr.prototype.Uniform4f = function(location, x, y, z, w) {
		var c;
		c = this;
		c.Object.uniform4f(location, x, y, z, w);
	};
	Context.prototype.Uniform4f = function(location, x, y, z, w) { return this.$val.Uniform4f(location, x, y, z, w); };
	Context.Ptr.prototype.Uniform4i = function(location, x, y, z, w) {
		var c;
		c = this;
		c.Object.uniform4i(location, x, y, z, w);
	};
	Context.prototype.Uniform4i = function(location, x, y, z, w) { return this.$val.Uniform4i(location, x, y, z, w); };
	Context.Ptr.prototype.UniformMatrix2fv = function(location, transpose, value) {
		var c;
		c = this;
		c.Object.uniformMatrix2fv(location, $externalize(transpose, $Bool), $externalize(value, ($sliceType($Float32))));
	};
	Context.prototype.UniformMatrix2fv = function(location, transpose, value) { return this.$val.UniformMatrix2fv(location, transpose, value); };
	Context.Ptr.prototype.UniformMatrix3fv = function(location, transpose, value) {
		var c;
		c = this;
		c.Object.uniformMatrix3fv(location, $externalize(transpose, $Bool), $externalize(value, ($sliceType($Float32))));
	};
	Context.prototype.UniformMatrix3fv = function(location, transpose, value) { return this.$val.UniformMatrix3fv(location, transpose, value); };
	Context.Ptr.prototype.UniformMatrix4fv = function(location, transpose, value) {
		var c;
		c = this;
		c.Object.uniformMatrix4fv(location, $externalize(transpose, $Bool), $externalize(value, ($sliceType($Float32))));
	};
	Context.prototype.UniformMatrix4fv = function(location, transpose, value) { return this.$val.UniformMatrix4fv(location, transpose, value); };
	Context.Ptr.prototype.UseProgram = function(program) {
		var c;
		c = this;
		c.Object.useProgram(program);
	};
	Context.prototype.UseProgram = function(program) { return this.$val.UseProgram(program); };
	Context.Ptr.prototype.ValidateProgram = function(program) {
		var c;
		c = this;
		c.Object.validateProgram(program);
	};
	Context.prototype.ValidateProgram = function(program) { return this.$val.ValidateProgram(program); };
	Context.Ptr.prototype.VertexAttribPointer = function(index, size, typ, normal, stride, offset) {
		var c;
		c = this;
		c.Object.vertexAttribPointer(index, size, typ, $externalize(normal, $Bool), stride, offset);
	};
	Context.prototype.VertexAttribPointer = function(index, size, typ, normal, stride, offset) { return this.$val.VertexAttribPointer(index, size, typ, normal, stride, offset); };
	Context.Ptr.prototype.Viewport = function(x, y, width, height) {
		var c;
		c = this;
		c.Object.viewport(x, y, width, height);
	};
	Context.prototype.Viewport = function(x, y, width, height) { return this.$val.Viewport(x, y, width, height); };
	$pkg.$init = function() {
		ContextAttributes.init([["Alpha", "Alpha", "", $Bool, ""], ["Depth", "Depth", "", $Bool, ""], ["Stencil", "Stencil", "", $Bool, ""], ["Antialias", "Antialias", "", $Bool, ""], ["PremultipliedAlpha", "PremultipliedAlpha", "", $Bool, ""], ["PreserveDrawingBuffer", "PreserveDrawingBuffer", "", $Bool, ""]]);
		Context.methods = [["Bool", "Bool", "", [], [$Bool], false, 0], ["Call", "Call", "", [$String, ($sliceType($emptyInterface))], [js.Object], true, 0], ["Delete", "Delete", "", [$String], [], false, 0], ["Float", "Float", "", [], [$Float64], false, 0], ["Get", "Get", "", [$String], [js.Object], false, 0], ["Index", "Index", "", [$Int], [js.Object], false, 0], ["Int", "Int", "", [], [$Int], false, 0], ["Int64", "Int64", "", [], [$Int64], false, 0], ["Interface", "Interface", "", [], [$emptyInterface], false, 0], ["Invoke", "Invoke", "", [($sliceType($emptyInterface))], [js.Object], true, 0], ["IsNull", "IsNull", "", [], [$Bool], false, 0], ["IsUndefined", "IsUndefined", "", [], [$Bool], false, 0], ["Length", "Length", "", [], [$Int], false, 0], ["New", "New", "", [($sliceType($emptyInterface))], [js.Object], true, 0], ["Set", "Set", "", [$String, $emptyInterface], [], false, 0], ["SetIndex", "SetIndex", "", [$Int, $emptyInterface], [], false, 0], ["Str", "Str", "", [], [$String], false, 0], ["Uint64", "Uint64", "", [], [$Uint64], false, 0], ["Unsafe", "Unsafe", "", [], [$Uintptr], false, 0]];
		($ptrType(Context)).methods = [["ActiveTexture", "ActiveTexture", "", [$Int], [], false, -1], ["AttachShader", "AttachShader", "", [js.Object, js.Object], [], false, -1], ["BindAttribLocation", "BindAttribLocation", "", [js.Object, $Int, $String], [], false, -1], ["BindBuffer", "BindBuffer", "", [$Int, js.Object], [], false, -1], ["BindFramebuffer", "BindFramebuffer", "", [$Int, js.Object], [], false, -1], ["BindRenderbuffer", "BindRenderbuffer", "", [$Int, js.Object], [], false, -1], ["BindTexture", "BindTexture", "", [$Int, js.Object], [], false, -1], ["BlendColor", "BlendColor", "", [$Float64, $Float64, $Float64, $Float64], [], false, -1], ["BlendEquation", "BlendEquation", "", [$Int], [], false, -1], ["BlendEquationSeparate", "BlendEquationSeparate", "", [$Int, $Int], [], false, -1], ["BlendFunc", "BlendFunc", "", [$Int, $Int], [], false, -1], ["BlendFuncSeparate", "BlendFuncSeparate", "", [$Int, $Int, $Int, $Int], [], false, -1], ["Bool", "Bool", "", [], [$Bool], false, 0], ["BufferData", "BufferData", "", [$Int, js.Object, $Int], [], false, -1], ["BufferSubData", "BufferSubData", "", [$Int, $Int, js.Object], [], false, -1], ["Call", "Call", "", [$String, ($sliceType($emptyInterface))], [js.Object], true, 0], ["CheckFramebufferStatus", "CheckFramebufferStatus", "", [$Int], [$Int], false, -1], ["Clear", "Clear", "", [$Int], [], false, -1], ["ClearColor", "ClearColor", "", [$Float32, $Float32, $Float32, $Float32], [], false, -1], ["ClearDepth", "ClearDepth", "", [$Float64], [], false, -1], ["ClearStencil", "ClearStencil", "", [$Int], [], false, -1], ["ColorMask", "ColorMask", "", [$Bool, $Bool, $Bool, $Bool], [], false, -1], ["CompileShader", "CompileShader", "", [js.Object], [], false, -1], ["CopyTexImage2D", "CopyTexImage2D", "", [$Int, $Int, $Int, $Int, $Int, $Int, $Int, $Int], [], false, -1], ["CopyTexSubImage2D", "CopyTexSubImage2D", "", [$Int, $Int, $Int, $Int, $Int, $Int, $Int, $Int], [], false, -1], ["CreateBuffer", "CreateBuffer", "", [], [js.Object], false, -1], ["CreateFramebuffer", "CreateFramebuffer", "", [], [js.Object], false, -1], ["CreateProgram", "CreateProgram", "", [], [js.Object], false, -1], ["CreateRenderbuffer", "CreateRenderbuffer", "", [], [js.Object], false, -1], ["CreateShader", "CreateShader", "", [$Int], [js.Object], false, -1], ["CreateTexture", "CreateTexture", "", [], [js.Object], false, -1], ["CullFace", "CullFace", "", [$Int], [], false, -1], ["Delete", "Delete", "", [$String], [], false, 0], ["DeleteBuffer", "DeleteBuffer", "", [js.Object], [], false, -1], ["DeleteFramebuffer", "DeleteFramebuffer", "", [js.Object], [], false, -1], ["DeleteProgram", "DeleteProgram", "", [js.Object], [], false, -1], ["DeleteRenderbuffer", "DeleteRenderbuffer", "", [js.Object], [], false, -1], ["DeleteShader", "DeleteShader", "", [js.Object], [], false, -1], ["DeleteTexture", "DeleteTexture", "", [js.Object], [], false, -1], ["DepthFunc", "DepthFunc", "", [$Int], [], false, -1], ["DepthMask", "DepthMask", "", [$Bool], [], false, -1], ["DepthRange", "DepthRange", "", [$Float64, $Float64], [], false, -1], ["DetachShader", "DetachShader", "", [js.Object, js.Object], [], false, -1], ["Disable", "Disable", "", [$Int], [], false, -1], ["DisableVertexAttribArray", "DisableVertexAttribArray", "", [$Int], [], false, -1], ["DrawArrays", "DrawArrays", "", [$Int, $Int, $Int], [], false, -1], ["DrawElements", "DrawElements", "", [$Int, $Int, $Int, $Int], [], false, -1], ["Enable", "Enable", "", [$Int], [], false, -1], ["EnableVertexAttribArray", "EnableVertexAttribArray", "", [$Int], [], false, -1], ["Finish", "Finish", "", [], [], false, -1], ["Float", "Float", "", [], [$Float64], false, 0], ["Flush", "Flush", "", [], [], false, -1], ["FrameBufferRenderBuffer", "FrameBufferRenderBuffer", "", [$Int, $Int, $Int, js.Object], [], false, -1], ["FramebufferTexture2D", "FramebufferTexture2D", "", [$Int, $Int, $Int, js.Object, $Int], [], false, -1], ["FrontFace", "FrontFace", "", [$Int], [], false, -1], ["GenerateMipmap", "GenerateMipmap", "", [$Int], [], false, -1], ["Get", "Get", "", [$String], [js.Object], false, 0], ["GetActiveAttrib", "GetActiveAttrib", "", [js.Object, $Int], [js.Object], false, -1], ["GetActiveUniform", "GetActiveUniform", "", [js.Object, $Int], [js.Object], false, -1], ["GetAttachedShaders", "GetAttachedShaders", "", [js.Object], [($sliceType(js.Object))], false, -1], ["GetAttribLocation", "GetAttribLocation", "", [js.Object, $String], [$Int], false, -1], ["GetBufferParameter", "GetBufferParameter", "", [$Int, $Int], [js.Object], false, -1], ["GetContextAttributes", "GetContextAttributes", "", [], [ContextAttributes], false, -1], ["GetError", "GetError", "", [], [$Int], false, -1], ["GetExtension", "GetExtension", "", [$String], [js.Object], false, -1], ["GetFramebufferAttachmentParameter", "GetFramebufferAttachmentParameter", "", [$Int, $Int, $Int], [js.Object], false, -1], ["GetParameter", "GetParameter", "", [$Int], [js.Object], false, -1], ["GetProgramInfoLog", "GetProgramInfoLog", "", [js.Object], [$String], false, -1], ["GetProgramParameterb", "GetProgramParameterb", "", [js.Object, $Int], [$Bool], false, -1], ["GetProgramParameteri", "GetProgramParameteri", "", [js.Object, $Int], [$Int], false, -1], ["GetRenderbufferParameter", "GetRenderbufferParameter", "", [$Int, $Int], [js.Object], false, -1], ["GetShaderInfoLog", "GetShaderInfoLog", "", [js.Object], [$String], false, -1], ["GetShaderParameter", "GetShaderParameter", "", [js.Object, $Int], [js.Object], false, -1], ["GetShaderParameterb", "GetShaderParameterb", "", [js.Object, $Int], [$Bool], false, -1], ["GetShaderSource", "GetShaderSource", "", [js.Object], [$String], false, -1], ["GetSupportedExtensions", "GetSupportedExtensions", "", [], [($sliceType($String))], false, -1], ["GetTexParameter", "GetTexParameter", "", [$Int, $Int], [js.Object], false, -1], ["GetUniform", "GetUniform", "", [js.Object, js.Object], [js.Object], false, -1], ["GetUniformLocation", "GetUniformLocation", "", [js.Object, $String], [js.Object], false, -1], ["GetVertexAttrib", "GetVertexAttrib", "", [$Int, $Int], [js.Object], false, -1], ["GetVertexAttribOffset", "GetVertexAttribOffset", "", [$Int, $Int], [$Int], false, -1], ["Index", "Index", "", [$Int], [js.Object], false, 0], ["Int", "Int", "", [], [$Int], false, 0], ["Int64", "Int64", "", [], [$Int64], false, 0], ["Interface", "Interface", "", [], [$emptyInterface], false, 0], ["Invoke", "Invoke", "", [($sliceType($emptyInterface))], [js.Object], true, 0], ["IsBuffer", "IsBuffer", "", [js.Object], [$Bool], false, -1], ["IsContextLost", "IsContextLost", "", [], [$Bool], false, -1], ["IsEnabled", "IsEnabled", "", [$Int], [$Bool], false, -1], ["IsFramebuffer", "IsFramebuffer", "", [js.Object], [$Bool], false, -1], ["IsNull", "IsNull", "", [], [$Bool], false, 0], ["IsProgram", "IsProgram", "", [js.Object], [$Bool], false, -1], ["IsRenderbuffer", "IsRenderbuffer", "", [js.Object], [$Bool], false, -1], ["IsShader", "IsShader", "", [js.Object], [$Bool], false, -1], ["IsTexture", "IsTexture", "", [js.Object], [$Bool], false, -1], ["IsUndefined", "IsUndefined", "", [], [$Bool], false, 0], ["Length", "Length", "", [], [$Int], false, 0], ["LineWidth", "LineWidth", "", [$Float64], [], false, -1], ["LinkProgram", "LinkProgram", "", [js.Object], [], false, -1], ["New", "New", "", [($sliceType($emptyInterface))], [js.Object], true, 0], ["PixelStorei", "PixelStorei", "", [$Int, $Int], [], false, -1], ["PolygonOffset", "PolygonOffset", "", [$Float64, $Float64], [], false, -1], ["ReadPixels", "ReadPixels", "", [$Int, $Int, $Int, $Int, $Int, $Int, js.Object], [], false, -1], ["RenderbufferStorage", "RenderbufferStorage", "", [$Int, $Int, $Int, $Int], [], false, -1], ["Scissor", "Scissor", "", [$Int, $Int, $Int, $Int], [], false, -1], ["Set", "Set", "", [$String, $emptyInterface], [], false, 0], ["SetIndex", "SetIndex", "", [$Int, $emptyInterface], [], false, 0], ["ShaderSource", "ShaderSource", "", [js.Object, $String], [], false, -1], ["Str", "Str", "", [], [$String], false, 0], ["TexImage2D", "TexImage2D", "", [$Int, $Int, $Int, $Int, $Int, js.Object], [], false, -1], ["TexParameteri", "TexParameteri", "", [$Int, $Int, $Int], [], false, -1], ["TexSubImage2D", "TexSubImage2D", "", [$Int, $Int, $Int, $Int, $Int, $Int, js.Object], [], false, -1], ["Uint64", "Uint64", "", [], [$Uint64], false, 0], ["Uniform1f", "Uniform1f", "", [js.Object, $Float32], [], false, -1], ["Uniform1i", "Uniform1i", "", [js.Object, $Int], [], false, -1], ["Uniform2f", "Uniform2f", "", [js.Object, $Float32, $Float32], [], false, -1], ["Uniform2i", "Uniform2i", "", [js.Object, $Int, $Int], [], false, -1], ["Uniform3f", "Uniform3f", "", [js.Object, $Float32, $Float32, $Float32], [], false, -1], ["Uniform3i", "Uniform3i", "", [js.Object, $Int, $Int, $Int], [], false, -1], ["Uniform4f", "Uniform4f", "", [js.Object, $Float32, $Float32, $Float32, $Float32], [], false, -1], ["Uniform4i", "Uniform4i", "", [js.Object, $Int, $Int, $Int, $Int], [], false, -1], ["UniformMatrix2fv", "UniformMatrix2fv", "", [js.Object, $Bool, ($sliceType($Float32))], [], false, -1], ["UniformMatrix3fv", "UniformMatrix3fv", "", [js.Object, $Bool, ($sliceType($Float32))], [], false, -1], ["UniformMatrix4fv", "UniformMatrix4fv", "", [js.Object, $Bool, ($sliceType($Float32))], [], false, -1], ["Unsafe", "Unsafe", "", [], [$Uintptr], false, 0], ["UseProgram", "UseProgram", "", [js.Object], [], false, -1], ["ValidateProgram", "ValidateProgram", "", [js.Object], [], false, -1], ["VertexAttribPointer", "VertexAttribPointer", "", [$Int, $Int, $Int, $Bool, $Int, $Int], [], false, -1], ["Viewport", "Viewport", "", [$Int, $Int, $Int, $Int], [], false, -1]];
		Context.init([["Object", "", "", js.Object, ""], ["ARRAY_BUFFER", "ARRAY_BUFFER", "", $Int, "js:\"ARRAY_BUFFER\""], ["ARRAY_BUFFER_BINDING", "ARRAY_BUFFER_BINDING", "", $Int, "js:\"ARRAY_BUFFER_BINDING\""], ["ATTACHED_SHADERS", "ATTACHED_SHADERS", "", $Int, "js:\"ATTACHED_SHADERS\""], ["BACK", "BACK", "", $Int, "js:\"BACK\""], ["BLEND", "BLEND", "", $Int, "js:\"BLEND\""], ["BLEND_COLOR", "BLEND_COLOR", "", $Int, "js:\"BLEND_COLOR\""], ["BLEND_DST_ALPHA", "BLEND_DST_ALPHA", "", $Int, "js:\"BLEND_DST_ALPHA\""], ["BLEND_DST_RGB", "BLEND_DST_RGB", "", $Int, "js:\"BLEND_DST_RGB\""], ["BLEND_EQUATION", "BLEND_EQUATION", "", $Int, "js:\"BLEND_EQUATION\""], ["BLEND_EQUATION_ALPHA", "BLEND_EQUATION_ALPHA", "", $Int, "js:\"BLEND_EQUATION_ALPHA\""], ["BLEND_EQUATION_RGB", "BLEND_EQUATION_RGB", "", $Int, "js:\"BLEND_EQUATION_RGB\""], ["BLEND_SRC_ALPHA", "BLEND_SRC_ALPHA", "", $Int, "js:\"BLEND_SRC_ALPHA\""], ["BLEND_SRC_RGB", "BLEND_SRC_RGB", "", $Int, "js:\"BLEND_SRC_RGB\""], ["BLUE_BITS", "BLUE_BITS", "", $Int, "js:\"BLUE_BITS\""], ["BOOL", "BOOL", "", $Int, "js:\"BOOL\""], ["BOOL_VEC2", "BOOL_VEC2", "", $Int, "js:\"BOOL_VEC2\""], ["BOOL_VEC3", "BOOL_VEC3", "", $Int, "js:\"BOOL_VEC3\""], ["BOOL_VEC4", "BOOL_VEC4", "", $Int, "js:\"BOOL_VEC4\""], ["BROWSER_DEFAULT_WEBGL", "BROWSER_DEFAULT_WEBGL", "", $Int, "js:\"BROWSER_DEFAULT_WEBGL\""], ["BUFFER_SIZE", "BUFFER_SIZE", "", $Int, "js:\"BUFFER_SIZE\""], ["BUFFER_USAGE", "BUFFER_USAGE", "", $Int, "js:\"BUFFER_USAGE\""], ["BYTE", "BYTE", "", $Int, "js:\"BYTE\""], ["CCW", "CCW", "", $Int, "js:\"CCW\""], ["CLAMP_TO_EDGE", "CLAMP_TO_EDGE", "", $Int, "js:\"CLAMP_TO_EDGE\""], ["COLOR_ATTACHMENT0", "COLOR_ATTACHMENT0", "", $Int, "js:\"COLOR_ATTACHMENT0\""], ["COLOR_BUFFER_BIT", "COLOR_BUFFER_BIT", "", $Int, "js:\"COLOR_BUFFER_BIT\""], ["COLOR_CLEAR_VALUE", "COLOR_CLEAR_VALUE", "", $Int, "js:\"COLOR_CLEAR_VALUE\""], ["COLOR_WRITEMASK", "COLOR_WRITEMASK", "", $Int, "js:\"COLOR_WRITEMASK\""], ["COMPILE_STATUS", "COMPILE_STATUS", "", $Int, "js:\"COMPILE_STATUS\""], ["COMPRESSED_TEXTURE_FORMATS", "COMPRESSED_TEXTURE_FORMATS", "", $Int, "js:\"COMPRESSED_TEXTURE_FORMATS\""], ["CONSTANT_ALPHA", "CONSTANT_ALPHA", "", $Int, "js:\"CONSTANT_ALPHA\""], ["CONSTANT_COLOR", "CONSTANT_COLOR", "", $Int, "js:\"CONSTANT_COLOR\""], ["CONTEXT_LOST_WEBGL", "CONTEXT_LOST_WEBGL", "", $Int, "js:\"CONTEXT_LOST_WEBGL\""], ["CULL_FACE", "CULL_FACE", "", $Int, "js:\"CULL_FACE\""], ["CULL_FACE_MODE", "CULL_FACE_MODE", "", $Int, "js:\"CULL_FACE_MODE\""], ["CURRENT_PROGRAM", "CURRENT_PROGRAM", "", $Int, "js:\"CURRENT_PROGRAM\""], ["CURRENT_VERTEX_ATTRIB", "CURRENT_VERTEX_ATTRIB", "", $Int, "js:\"CURRENT_VERTEX_ATTRIB\""], ["CW", "CW", "", $Int, "js:\"CW\""], ["DECR", "DECR", "", $Int, "js:\"DECR\""], ["DECR_WRAP", "DECR_WRAP", "", $Int, "js:\"DECR_WRAP\""], ["DELETE_STATUS", "DELETE_STATUS", "", $Int, "js:\"DELETE_STATUS\""], ["DEPTH_ATTACHMENT", "DEPTH_ATTACHMENT", "", $Int, "js:\"DEPTH_ATTACHMENT\""], ["DEPTH_BITS", "DEPTH_BITS", "", $Int, "js:\"DEPTH_BITS\""], ["DEPTH_BUFFER_BIT", "DEPTH_BUFFER_BIT", "", $Int, "js:\"DEPTH_BUFFER_BIT\""], ["DEPTH_CLEAR_VALUE", "DEPTH_CLEAR_VALUE", "", $Int, "js:\"DEPTH_CLEAR_VALUE\""], ["DEPTH_COMPONENT", "DEPTH_COMPONENT", "", $Int, "js:\"DEPTH_COMPONENT\""], ["DEPTH_COMPONENT16", "DEPTH_COMPONENT16", "", $Int, "js:\"DEPTH_COMPONENT16\""], ["DEPTH_FUNC", "DEPTH_FUNC", "", $Int, "js:\"DEPTH_FUNC\""], ["DEPTH_RANGE", "DEPTH_RANGE", "", $Int, "js:\"DEPTH_RANGE\""], ["DEPTH_STENCIL", "DEPTH_STENCIL", "", $Int, "js:\"DEPTH_STENCIL\""], ["DEPTH_STENCIL_ATTACHMENT", "DEPTH_STENCIL_ATTACHMENT", "", $Int, "js:\"DEPTH_STENCIL_ATTACHMENT\""], ["DEPTH_TEST", "DEPTH_TEST", "", $Int, "js:\"DEPTH_TEST\""], ["DEPTH_WRITEMASK", "DEPTH_WRITEMASK", "", $Int, "js:\"DEPTH_WRITEMASK\""], ["DITHER", "DITHER", "", $Int, "js:\"DITHER\""], ["DONT_CARE", "DONT_CARE", "", $Int, "js:\"DONT_CARE\""], ["DST_ALPHA", "DST_ALPHA", "", $Int, "js:\"DST_ALPHA\""], ["DST_COLOR", "DST_COLOR", "", $Int, "js:\"DST_COLOR\""], ["DYNAMIC_DRAW", "DYNAMIC_DRAW", "", $Int, "js:\"DYNAMIC_DRAW\""], ["ELEMENT_ARRAY_BUFFER", "ELEMENT_ARRAY_BUFFER", "", $Int, "js:\"ELEMENT_ARRAY_BUFFER\""], ["ELEMENT_ARRAY_BUFFER_BINDING", "ELEMENT_ARRAY_BUFFER_BINDING", "", $Int, "js:\"ELEMENT_ARRAY_BUFFER_BINDING\""], ["EQUAL", "EQUAL", "", $Int, "js:\"EQUAL\""], ["FASTEST", "FASTEST", "", $Int, "js:\"FASTEST\""], ["FLOAT", "FLOAT", "", $Int, "js:\"FLOAT\""], ["FLOAT_MAT2", "FLOAT_MAT2", "", $Int, "js:\"FLOAT_MAT2\""], ["FLOAT_MAT3", "FLOAT_MAT3", "", $Int, "js:\"FLOAT_MAT3\""], ["FLOAT_MAT4", "FLOAT_MAT4", "", $Int, "js:\"FLOAT_MAT4\""], ["FLOAT_VEC2", "FLOAT_VEC2", "", $Int, "js:\"FLOAT_VEC2\""], ["FLOAT_VEC3", "FLOAT_VEC3", "", $Int, "js:\"FLOAT_VEC3\""], ["FLOAT_VEC4", "FLOAT_VEC4", "", $Int, "js:\"FLOAT_VEC4\""], ["FRAGMENT_SHADER", "FRAGMENT_SHADER", "", $Int, "js:\"FRAGMENT_SHADER\""], ["FRAMEBUFFER", "FRAMEBUFFER", "", $Int, "js:\"FRAMEBUFFER\""], ["FRAMEBUFFER_ATTACHMENT_OBJECT_NAME", "FRAMEBUFFER_ATTACHMENT_OBJECT_NAME", "", $Int, "js:\"FRAMEBUFFER_ATTACHMENT_OBJECT_NAME\""], ["FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE", "FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE", "", $Int, "js:\"FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE\""], ["FRAMEBUFFER_ATTACHMENT_TEXTURE_CUBE_MAP_FACE", "FRAMEBUFFER_ATTACHMENT_TEXTURE_CUBE_MAP_FACE", "", $Int, "js:\"FRAMEBUFFER_ATTACHMENT_TEXTURE_CUBE_MAP_FACE\""], ["FRAMEBUFFER_ATTACHMENT_TEXTURE_LEVEL", "FRAMEBUFFER_ATTACHMENT_TEXTURE_LEVEL", "", $Int, "js:\"FRAMEBUFFER_ATTACHMENT_TEXTURE_LEVEL\""], ["FRAMEBUFFER_BINDING", "FRAMEBUFFER_BINDING", "", $Int, "js:\"FRAMEBUFFER_BINDING\""], ["FRAMEBUFFER_COMPLETE", "FRAMEBUFFER_COMPLETE", "", $Int, "js:\"FRAMEBUFFER_COMPLETE\""], ["FRAMEBUFFER_INCOMPLETE_ATTACHMENT", "FRAMEBUFFER_INCOMPLETE_ATTACHMENT", "", $Int, "js:\"FRAMEBUFFER_INCOMPLETE_ATTACHMENT\""], ["FRAMEBUFFER_INCOMPLETE_DIMENSIONS", "FRAMEBUFFER_INCOMPLETE_DIMENSIONS", "", $Int, "js:\"FRAMEBUFFER_INCOMPLETE_DIMENSIONS\""], ["FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT", "FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT", "", $Int, "js:\"FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT\""], ["FRAMEBUFFER_UNSUPPORTED", "FRAMEBUFFER_UNSUPPORTED", "", $Int, "js:\"FRAMEBUFFER_UNSUPPORTED\""], ["FRONT", "FRONT", "", $Int, "js:\"FRONT\""], ["FRONT_AND_BACK", "FRONT_AND_BACK", "", $Int, "js:\"FRONT_AND_BACK\""], ["FRONT_FACE", "FRONT_FACE", "", $Int, "js:\"FRONT_FACE\""], ["FUNC_ADD", "FUNC_ADD", "", $Int, "js:\"FUNC_ADD\""], ["FUNC_REVERSE_SUBTRACT", "FUNC_REVERSE_SUBTRACT", "", $Int, "js:\"FUNC_REVERSE_SUBTRACT\""], ["FUNC_SUBTRACT", "FUNC_SUBTRACT", "", $Int, "js:\"FUNC_SUBTRACT\""], ["GENERATE_MIPMAP_HINT", "GENERATE_MIPMAP_HINT", "", $Int, "js:\"GENERATE_MIPMAP_HINT\""], ["GEQUAL", "GEQUAL", "", $Int, "js:\"GEQUAL\""], ["GREATER", "GREATER", "", $Int, "js:\"GREATER\""], ["GREEN_BITS", "GREEN_BITS", "", $Int, "js:\"GREEN_BITS\""], ["HIGH_FLOAT", "HIGH_FLOAT", "", $Int, "js:\"HIGH_FLOAT\""], ["HIGH_INT", "HIGH_INT", "", $Int, "js:\"HIGH_INT\""], ["INCR", "INCR", "", $Int, "js:\"INCR\""], ["INCR_WRAP", "INCR_WRAP", "", $Int, "js:\"INCR_WRAP\""], ["INFO_LOG_LENGTH", "INFO_LOG_LENGTH", "", $Int, "js:\"INFO_LOG_LENGTH\""], ["INT", "INT", "", $Int, "js:\"INT\""], ["INT_VEC2", "INT_VEC2", "", $Int, "js:\"INT_VEC2\""], ["INT_VEC3", "INT_VEC3", "", $Int, "js:\"INT_VEC3\""], ["INT_VEC4", "INT_VEC4", "", $Int, "js:\"INT_VEC4\""], ["INVALID_ENUM", "INVALID_ENUM", "", $Int, "js:\"INVALID_ENUM\""], ["INVALID_FRAMEBUFFER_OPERATION", "INVALID_FRAMEBUFFER_OPERATION", "", $Int, "js:\"INVALID_FRAMEBUFFER_OPERATION\""], ["INVALID_OPERATION", "INVALID_OPERATION", "", $Int, "js:\"INVALID_OPERATION\""], ["INVALID_VALUE", "INVALID_VALUE", "", $Int, "js:\"INVALID_VALUE\""], ["INVERT", "INVERT", "", $Int, "js:\"INVERT\""], ["KEEP", "KEEP", "", $Int, "js:\"KEEP\""], ["LEQUAL", "LEQUAL", "", $Int, "js:\"LEQUAL\""], ["LESS", "LESS", "", $Int, "js:\"LESS\""], ["LINEAR", "LINEAR", "", $Int, "js:\"LINEAR\""], ["LINEAR_MIPMAP_LINEAR", "LINEAR_MIPMAP_LINEAR", "", $Int, "js:\"LINEAR_MIPMAP_LINEAR\""], ["LINEAR_MIPMAP_NEAREST", "LINEAR_MIPMAP_NEAREST", "", $Int, "js:\"LINEAR_MIPMAP_NEAREST\""], ["LINES", "LINES", "", $Int, "js:\"LINES\""], ["LINE_LOOP", "LINE_LOOP", "", $Int, "js:\"LINE_LOOP\""], ["LINE_STRIP", "LINE_STRIP", "", $Int, "js:\"LINE_STRIP\""], ["LINE_WIDTH", "LINE_WIDTH", "", $Int, "js:\"LINE_WIDTH\""], ["LINK_STATUS", "LINK_STATUS", "", $Int, "js:\"LINK_STATUS\""], ["LOW_FLOAT", "LOW_FLOAT", "", $Int, "js:\"LOW_FLOAT\""], ["LOW_INT", "LOW_INT", "", $Int, "js:\"LOW_INT\""], ["LUMINANCE", "LUMINANCE", "", $Int, "js:\"LUMINANCE\""], ["LUMINANCE_ALPHA", "LUMINANCE_ALPHA", "", $Int, "js:\"LUMINANCE_ALPHA\""], ["MAX_COMBINED_TEXTURE_IMAGE_UNITS", "MAX_COMBINED_TEXTURE_IMAGE_UNITS", "", $Int, "js:\"MAX_COMBINED_TEXTURE_IMAGE_UNITS\""], ["MAX_CUBE_MAP_TEXTURE_SIZE", "MAX_CUBE_MAP_TEXTURE_SIZE", "", $Int, "js:\"MAX_CUBE_MAP_TEXTURE_SIZE\""], ["MAX_FRAGMENT_UNIFORM_VECTORS", "MAX_FRAGMENT_UNIFORM_VECTORS", "", $Int, "js:\"MAX_FRAGMENT_UNIFORM_VECTORS\""], ["MAX_RENDERBUFFER_SIZE", "MAX_RENDERBUFFER_SIZE", "", $Int, "js:\"MAX_RENDERBUFFER_SIZE\""], ["MAX_TEXTURE_IMAGE_UNITS", "MAX_TEXTURE_IMAGE_UNITS", "", $Int, "js:\"MAX_TEXTURE_IMAGE_UNITS\""], ["MAX_TEXTURE_SIZE", "MAX_TEXTURE_SIZE", "", $Int, "js:\"MAX_TEXTURE_SIZE\""], ["MAX_VARYING_VECTORS", "MAX_VARYING_VECTORS", "", $Int, "js:\"MAX_VARYING_VECTORS\""], ["MAX_VERTEX_ATTRIBS", "MAX_VERTEX_ATTRIBS", "", $Int, "js:\"MAX_VERTEX_ATTRIBS\""], ["MAX_VERTEX_TEXTURE_IMAGE_UNITS", "MAX_VERTEX_TEXTURE_IMAGE_UNITS", "", $Int, "js:\"MAX_VERTEX_TEXTURE_IMAGE_UNITS\""], ["MAX_VERTEX_UNIFORM_VECTORS", "MAX_VERTEX_UNIFORM_VECTORS", "", $Int, "js:\"MAX_VERTEX_UNIFORM_VECTORS\""], ["MAX_VIEWPORT_DIMS", "MAX_VIEWPORT_DIMS", "", $Int, "js:\"MAX_VIEWPORT_DIMS\""], ["MEDIUM_FLOAT", "MEDIUM_FLOAT", "", $Int, "js:\"MEDIUM_FLOAT\""], ["MEDIUM_INT", "MEDIUM_INT", "", $Int, "js:\"MEDIUM_INT\""], ["MIRRORED_REPEAT", "MIRRORED_REPEAT", "", $Int, "js:\"MIRRORED_REPEAT\""], ["NEAREST", "NEAREST", "", $Int, "js:\"NEAREST\""], ["NEAREST_MIPMAP_LINEAR", "NEAREST_MIPMAP_LINEAR", "", $Int, "js:\"NEAREST_MIPMAP_LINEAR\""], ["NEAREST_MIPMAP_NEAREST", "NEAREST_MIPMAP_NEAREST", "", $Int, "js:\"NEAREST_MIPMAP_NEAREST\""], ["NEVER", "NEVER", "", $Int, "js:\"NEVER\""], ["NICEST", "NICEST", "", $Int, "js:\"NICEST\""], ["NONE", "NONE", "", $Int, "js:\"NONE\""], ["NOTEQUAL", "NOTEQUAL", "", $Int, "js:\"NOTEQUAL\""], ["NO_ERROR", "NO_ERROR", "", $Int, "js:\"NO_ERROR\""], ["NUM_COMPRESSED_TEXTURE_FORMATS", "NUM_COMPRESSED_TEXTURE_FORMATS", "", $Int, "js:\"NUM_COMPRESSED_TEXTURE_FORMATS\""], ["ONE", "ONE", "", $Int, "js:\"ONE\""], ["ONE_MINUS_CONSTANT_ALPHA", "ONE_MINUS_CONSTANT_ALPHA", "", $Int, "js:\"ONE_MINUS_CONSTANT_ALPHA\""], ["ONE_MINUS_CONSTANT_COLOR", "ONE_MINUS_CONSTANT_COLOR", "", $Int, "js:\"ONE_MINUS_CONSTANT_COLOR\""], ["ONE_MINUS_DST_ALPHA", "ONE_MINUS_DST_ALPHA", "", $Int, "js:\"ONE_MINUS_DST_ALPHA\""], ["ONE_MINUS_DST_COLOR", "ONE_MINUS_DST_COLOR", "", $Int, "js:\"ONE_MINUS_DST_COLOR\""], ["ONE_MINUS_SRC_ALPHA", "ONE_MINUS_SRC_ALPHA", "", $Int, "js:\"ONE_MINUS_SRC_ALPHA\""], ["ONE_MINUS_SRC_COLOR", "ONE_MINUS_SRC_COLOR", "", $Int, "js:\"ONE_MINUS_SRC_COLOR\""], ["OUT_OF_MEMORY", "OUT_OF_MEMORY", "", $Int, "js:\"OUT_OF_MEMORY\""], ["PACK_ALIGNMENT", "PACK_ALIGNMENT", "", $Int, "js:\"PACK_ALIGNMENT\""], ["POINTS", "POINTS", "", $Int, "js:\"POINTS\""], ["POLYGON_OFFSET_FACTOR", "POLYGON_OFFSET_FACTOR", "", $Int, "js:\"POLYGON_OFFSET_FACTOR\""], ["POLYGON_OFFSET_FILL", "POLYGON_OFFSET_FILL", "", $Int, "js:\"POLYGON_OFFSET_FILL\""], ["POLYGON_OFFSET_UNITS", "POLYGON_OFFSET_UNITS", "", $Int, "js:\"POLYGON_OFFSET_UNITS\""], ["RED_BITS", "RED_BITS", "", $Int, "js:\"RED_BITS\""], ["RENDERBUFFER", "RENDERBUFFER", "", $Int, "js:\"RENDERBUFFER\""], ["RENDERBUFFER_ALPHA_SIZE", "RENDERBUFFER_ALPHA_SIZE", "", $Int, "js:\"RENDERBUFFER_ALPHA_SIZE\""], ["RENDERBUFFER_BINDING", "RENDERBUFFER_BINDING", "", $Int, "js:\"RENDERBUFFER_BINDING\""], ["RENDERBUFFER_BLUE_SIZE", "RENDERBUFFER_BLUE_SIZE", "", $Int, "js:\"RENDERBUFFER_BLUE_SIZE\""], ["RENDERBUFFER_DEPTH_SIZE", "RENDERBUFFER_DEPTH_SIZE", "", $Int, "js:\"RENDERBUFFER_DEPTH_SIZE\""], ["RENDERBUFFER_GREEN_SIZE", "RENDERBUFFER_GREEN_SIZE", "", $Int, "js:\"RENDERBUFFER_GREEN_SIZE\""], ["RENDERBUFFER_HEIGHT", "RENDERBUFFER_HEIGHT", "", $Int, "js:\"RENDERBUFFER_HEIGHT\""], ["RENDERBUFFER_INTERNAL_FORMAT", "RENDERBUFFER_INTERNAL_FORMAT", "", $Int, "js:\"RENDERBUFFER_INTERNAL_FORMAT\""], ["RENDERBUFFER_RED_SIZE", "RENDERBUFFER_RED_SIZE", "", $Int, "js:\"RENDERBUFFER_RED_SIZE\""], ["RENDERBUFFER_STENCIL_SIZE", "RENDERBUFFER_STENCIL_SIZE", "", $Int, "js:\"RENDERBUFFER_STENCIL_SIZE\""], ["RENDERBUFFER_WIDTH", "RENDERBUFFER_WIDTH", "", $Int, "js:\"RENDERBUFFER_WIDTH\""], ["RENDERER", "RENDERER", "", $Int, "js:\"RENDERER\""], ["REPEAT", "REPEAT", "", $Int, "js:\"REPEAT\""], ["REPLACE", "REPLACE", "", $Int, "js:\"REPLACE\""], ["RGB", "RGB", "", $Int, "js:\"RGB\""], ["RGB5_A1", "RGB5_A1", "", $Int, "js:\"RGB5_A1\""], ["RGB565", "RGB565", "", $Int, "js:\"RGB565\""], ["RGBA", "RGBA", "", $Int, "js:\"RGBA\""], ["RGBA4", "RGBA4", "", $Int, "js:\"RGBA4\""], ["SAMPLER_2D", "SAMPLER_2D", "", $Int, "js:\"SAMPLER_2D\""], ["SAMPLER_CUBE", "SAMPLER_CUBE", "", $Int, "js:\"SAMPLER_CUBE\""], ["SAMPLES", "SAMPLES", "", $Int, "js:\"SAMPLES\""], ["SAMPLE_ALPHA_TO_COVERAGE", "SAMPLE_ALPHA_TO_COVERAGE", "", $Int, "js:\"SAMPLE_ALPHA_TO_COVERAGE\""], ["SAMPLE_BUFFERS", "SAMPLE_BUFFERS", "", $Int, "js:\"SAMPLE_BUFFERS\""], ["SAMPLE_COVERAGE", "SAMPLE_COVERAGE", "", $Int, "js:\"SAMPLE_COVERAGE\""], ["SAMPLE_COVERAGE_INVERT", "SAMPLE_COVERAGE_INVERT", "", $Int, "js:\"SAMPLE_COVERAGE_INVERT\""], ["SAMPLE_COVERAGE_VALUE", "SAMPLE_COVERAGE_VALUE", "", $Int, "js:\"SAMPLE_COVERAGE_VALUE\""], ["SCISSOR_BOX", "SCISSOR_BOX", "", $Int, "js:\"SCISSOR_BOX\""], ["SCISSOR_TEST", "SCISSOR_TEST", "", $Int, "js:\"SCISSOR_TEST\""], ["SHADER_COMPILER", "SHADER_COMPILER", "", $Int, "js:\"SHADER_COMPILER\""], ["SHADER_SOURCE_LENGTH", "SHADER_SOURCE_LENGTH", "", $Int, "js:\"SHADER_SOURCE_LENGTH\""], ["SHADER_TYPE", "SHADER_TYPE", "", $Int, "js:\"SHADER_TYPE\""], ["SHADING_LANGUAGE_VERSION", "SHADING_LANGUAGE_VERSION", "", $Int, "js:\"SHADING_LANGUAGE_VERSION\""], ["SHORT", "SHORT", "", $Int, "js:\"SHORT\""], ["SRC_ALPHA", "SRC_ALPHA", "", $Int, "js:\"SRC_ALPHA\""], ["SRC_ALPHA_SATURATE", "SRC_ALPHA_SATURATE", "", $Int, "js:\"SRC_ALPHA_SATURATE\""], ["SRC_COLOR", "SRC_COLOR", "", $Int, "js:\"SRC_COLOR\""], ["STATIC_DRAW", "STATIC_DRAW", "", $Int, "js:\"STATIC_DRAW\""], ["STENCIL_ATTACHMENT", "STENCIL_ATTACHMENT", "", $Int, "js:\"STENCIL_ATTACHMENT\""], ["STENCIL_BACK_FAIL", "STENCIL_BACK_FAIL", "", $Int, "js:\"STENCIL_BACK_FAIL\""], ["STENCIL_BACK_FUNC", "STENCIL_BACK_FUNC", "", $Int, "js:\"STENCIL_BACK_FUNC\""], ["STENCIL_BACK_PASS_DEPTH_FAIL", "STENCIL_BACK_PASS_DEPTH_FAIL", "", $Int, "js:\"STENCIL_BACK_PASS_DEPTH_FAIL\""], ["STENCIL_BACK_PASS_DEPTH_PASS", "STENCIL_BACK_PASS_DEPTH_PASS", "", $Int, "js:\"STENCIL_BACK_PASS_DEPTH_PASS\""], ["STENCIL_BACK_REF", "STENCIL_BACK_REF", "", $Int, "js:\"STENCIL_BACK_REF\""], ["STENCIL_BACK_VALUE_MASK", "STENCIL_BACK_VALUE_MASK", "", $Int, "js:\"STENCIL_BACK_VALUE_MASK\""], ["STENCIL_BACK_WRITEMASK", "STENCIL_BACK_WRITEMASK", "", $Int, "js:\"STENCIL_BACK_WRITEMASK\""], ["STENCIL_BITS", "STENCIL_BITS", "", $Int, "js:\"STENCIL_BITS\""], ["STENCIL_BUFFER_BIT", "STENCIL_BUFFER_BIT", "", $Int, "js:\"STENCIL_BUFFER_BIT\""], ["STENCIL_CLEAR_VALUE", "STENCIL_CLEAR_VALUE", "", $Int, "js:\"STENCIL_CLEAR_VALUE\""], ["STENCIL_FAIL", "STENCIL_FAIL", "", $Int, "js:\"STENCIL_FAIL\""], ["STENCIL_FUNC", "STENCIL_FUNC", "", $Int, "js:\"STENCIL_FUNC\""], ["STENCIL_INDEX", "STENCIL_INDEX", "", $Int, "js:\"STENCIL_INDEX\""], ["STENCIL_INDEX8", "STENCIL_INDEX8", "", $Int, "js:\"STENCIL_INDEX8\""], ["STENCIL_PASS_DEPTH_FAIL", "STENCIL_PASS_DEPTH_FAIL", "", $Int, "js:\"STENCIL_PASS_DEPTH_FAIL\""], ["STENCIL_PASS_DEPTH_PASS", "STENCIL_PASS_DEPTH_PASS", "", $Int, "js:\"STENCIL_PASS_DEPTH_PASS\""], ["STENCIL_REF", "STENCIL_REF", "", $Int, "js:\"STENCIL_REF\""], ["STENCIL_TEST", "STENCIL_TEST", "", $Int, "js:\"STENCIL_TEST\""], ["STENCIL_VALUE_MASK", "STENCIL_VALUE_MASK", "", $Int, "js:\"STENCIL_VALUE_MASK\""], ["STENCIL_WRITEMASK", "STENCIL_WRITEMASK", "", $Int, "js:\"STENCIL_WRITEMASK\""], ["STREAM_DRAW", "STREAM_DRAW", "", $Int, "js:\"STREAM_DRAW\""], ["SUBPIXEL_BITS", "SUBPIXEL_BITS", "", $Int, "js:\"SUBPIXEL_BITS\""], ["TEXTURE", "TEXTURE", "", $Int, "js:\"TEXTURE\""], ["TEXTURE0", "TEXTURE0", "", $Int, "js:\"TEXTURE0\""], ["TEXTURE1", "TEXTURE1", "", $Int, "js:\"TEXTURE1\""], ["TEXTURE2", "TEXTURE2", "", $Int, "js:\"TEXTURE2\""], ["TEXTURE3", "TEXTURE3", "", $Int, "js:\"TEXTURE3\""], ["TEXTURE4", "TEXTURE4", "", $Int, "js:\"TEXTURE4\""], ["TEXTURE5", "TEXTURE5", "", $Int, "js:\"TEXTURE5\""], ["TEXTURE6", "TEXTURE6", "", $Int, "js:\"TEXTURE6\""], ["TEXTURE7", "TEXTURE7", "", $Int, "js:\"TEXTURE7\""], ["TEXTURE8", "TEXTURE8", "", $Int, "js:\"TEXTURE8\""], ["TEXTURE9", "TEXTURE9", "", $Int, "js:\"TEXTURE9\""], ["TEXTURE10", "TEXTURE10", "", $Int, "js:\"TEXTURE10\""], ["TEXTURE11", "TEXTURE11", "", $Int, "js:\"TEXTURE11\""], ["TEXTURE12", "TEXTURE12", "", $Int, "js:\"TEXTURE12\""], ["TEXTURE13", "TEXTURE13", "", $Int, "js:\"TEXTURE13\""], ["TEXTURE14", "TEXTURE14", "", $Int, "js:\"TEXTURE14\""], ["TEXTURE15", "TEXTURE15", "", $Int, "js:\"TEXTURE15\""], ["TEXTURE16", "TEXTURE16", "", $Int, "js:\"TEXTURE16\""], ["TEXTURE17", "TEXTURE17", "", $Int, "js:\"TEXTURE17\""], ["TEXTURE18", "TEXTURE18", "", $Int, "js:\"TEXTURE18\""], ["TEXTURE19", "TEXTURE19", "", $Int, "js:\"TEXTURE19\""], ["TEXTURE20", "TEXTURE20", "", $Int, "js:\"TEXTURE20\""], ["TEXTURE21", "TEXTURE21", "", $Int, "js:\"TEXTURE21\""], ["TEXTURE22", "TEXTURE22", "", $Int, "js:\"TEXTURE22\""], ["TEXTURE23", "TEXTURE23", "", $Int, "js:\"TEXTURE23\""], ["TEXTURE24", "TEXTURE24", "", $Int, "js:\"TEXTURE24\""], ["TEXTURE25", "TEXTURE25", "", $Int, "js:\"TEXTURE25\""], ["TEXTURE26", "TEXTURE26", "", $Int, "js:\"TEXTURE26\""], ["TEXTURE27", "TEXTURE27", "", $Int, "js:\"TEXTURE27\""], ["TEXTURE28", "TEXTURE28", "", $Int, "js:\"TEXTURE28\""], ["TEXTURE29", "TEXTURE29", "", $Int, "js:\"TEXTURE29\""], ["TEXTURE30", "TEXTURE30", "", $Int, "js:\"TEXTURE30\""], ["TEXTURE31", "TEXTURE31", "", $Int, "js:\"TEXTURE31\""], ["TEXTURE_2D", "TEXTURE_2D", "", $Int, "js:\"TEXTURE_2D\""], ["TEXTURE_BINDING_2D", "TEXTURE_BINDING_2D", "", $Int, "js:\"TEXTURE_BINDING_2D\""], ["TEXTURE_BINDING_CUBE_MAP", "TEXTURE_BINDING_CUBE_MAP", "", $Int, "js:\"TEXTURE_BINDING_CUBE_MAP\""], ["TEXTURE_CUBE_MAP", "TEXTURE_CUBE_MAP", "", $Int, "js:\"TEXTURE_CUBE_MAP\""], ["TEXTURE_CUBE_MAP_NEGATIVE_X", "TEXTURE_CUBE_MAP_NEGATIVE_X", "", $Int, "js:\"TEXTURE_CUBE_MAP_NEGATIVE_X\""], ["TEXTURE_CUBE_MAP_NEGATIVE_Y", "TEXTURE_CUBE_MAP_NEGATIVE_Y", "", $Int, "js:\"TEXTURE_CUBE_MAP_NEGATIVE_Y\""], ["TEXTURE_CUBE_MAP_NEGATIVE_Z", "TEXTURE_CUBE_MAP_NEGATIVE_Z", "", $Int, "js:\"TEXTURE_CUBE_MAP_NEGATIVE_Z\""], ["TEXTURE_CUBE_MAP_POSITIVE_X", "TEXTURE_CUBE_MAP_POSITIVE_X", "", $Int, "js:\"TEXTURE_CUBE_MAP_POSITIVE_X\""], ["TEXTURE_CUBE_MAP_POSITIVE_Y", "TEXTURE_CUBE_MAP_POSITIVE_Y", "", $Int, "js:\"TEXTURE_CUBE_MAP_POSITIVE_Y\""], ["TEXTURE_CUBE_MAP_POSITIVE_Z", "TEXTURE_CUBE_MAP_POSITIVE_Z", "", $Int, "js:\"TEXTURE_CUBE_MAP_POSITIVE_Z\""], ["TEXTURE_MAG_FILTER", "TEXTURE_MAG_FILTER", "", $Int, "js:\"TEXTURE_MAG_FILTER\""], ["TEXTURE_MIN_FILTER", "TEXTURE_MIN_FILTER", "", $Int, "js:\"TEXTURE_MIN_FILTER\""], ["TEXTURE_WRAP_S", "TEXTURE_WRAP_S", "", $Int, "js:\"TEXTURE_WRAP_S\""], ["TEXTURE_WRAP_T", "TEXTURE_WRAP_T", "", $Int, "js:\"TEXTURE_WRAP_T\""], ["TRIANGLES", "TRIANGLES", "", $Int, "js:\"TRIANGLES\""], ["TRIANGLE_FAN", "TRIANGLE_FAN", "", $Int, "js:\"TRIANGLE_FAN\""], ["TRIANGLE_STRIP", "TRIANGLE_STRIP", "", $Int, "js:\"TRIANGLE_STRIP\""], ["UNPACK_ALIGNMENT", "UNPACK_ALIGNMENT", "", $Int, "js:\"UNPACK_ALIGNMENT\""], ["UNPACK_COLORSPACE_CONVERSION_WEBGL", "UNPACK_COLORSPACE_CONVERSION_WEBGL", "", $Int, "js:\"UNPACK_COLORSPACE_CONVERSION_WEBGL\""], ["UNPACK_FLIP_Y_WEBGL", "UNPACK_FLIP_Y_WEBGL", "", $Int, "js:\"UNPACK_FLIP_Y_WEBGL\""], ["UNPACK_PREMULTIPLY_ALPHA_WEBGL", "UNPACK_PREMULTIPLY_ALPHA_WEBGL", "", $Int, "js:\"UNPACK_PREMULTIPLY_ALPHA_WEBGL\""], ["UNSIGNED_BYTE", "UNSIGNED_BYTE", "", $Int, "js:\"UNSIGNED_BYTE\""], ["UNSIGNED_INT", "UNSIGNED_INT", "", $Int, "js:\"UNSIGNED_INT\""], ["UNSIGNED_SHORT", "UNSIGNED_SHORT", "", $Int, "js:\"UNSIGNED_SHORT\""], ["UNSIGNED_SHORT_4_4_4_4", "UNSIGNED_SHORT_4_4_4_4", "", $Int, "js:\"UNSIGNED_SHORT_4_4_4_4\""], ["UNSIGNED_SHORT_5_5_5_1", "UNSIGNED_SHORT_5_5_5_1", "", $Int, "js:\"UNSIGNED_SHORT_5_5_5_1\""], ["UNSIGNED_SHORT_5_6_5", "UNSIGNED_SHORT_5_6_5", "", $Int, "js:\"UNSIGNED_SHORT_5_6_5\""], ["VALIDATE_STATUS", "VALIDATE_STATUS", "", $Int, "js:\"VALIDATE_STATUS\""], ["VENDOR", "VENDOR", "", $Int, "js:\"VENDOR\""], ["VERSION", "VERSION", "", $Int, "js:\"VERSION\""], ["VERTEX_ATTRIB_ARRAY_BUFFER_BINDING", "VERTEX_ATTRIB_ARRAY_BUFFER_BINDING", "", $Int, "js:\"VERTEX_ATTRIB_ARRAY_BUFFER_BINDING\""], ["VERTEX_ATTRIB_ARRAY_ENABLED", "VERTEX_ATTRIB_ARRAY_ENABLED", "", $Int, "js:\"VERTEX_ATTRIB_ARRAY_ENABLED\""], ["VERTEX_ATTRIB_ARRAY_NORMALIZED", "VERTEX_ATTRIB_ARRAY_NORMALIZED", "", $Int, "js:\"VERTEX_ATTRIB_ARRAY_NORMALIZED\""], ["VERTEX_ATTRIB_ARRAY_POINTER", "VERTEX_ATTRIB_ARRAY_POINTER", "", $Int, "js:\"VERTEX_ATTRIB_ARRAY_POINTER\""], ["VERTEX_ATTRIB_ARRAY_SIZE", "VERTEX_ATTRIB_ARRAY_SIZE", "", $Int, "js:\"VERTEX_ATTRIB_ARRAY_SIZE\""], ["VERTEX_ATTRIB_ARRAY_STRIDE", "VERTEX_ATTRIB_ARRAY_STRIDE", "", $Int, "js:\"VERTEX_ATTRIB_ARRAY_STRIDE\""], ["VERTEX_ATTRIB_ARRAY_TYPE", "VERTEX_ATTRIB_ARRAY_TYPE", "", $Int, "js:\"VERTEX_ATTRIB_ARRAY_TYPE\""], ["VERTEX_SHADER", "VERTEX_SHADER", "", $Int, "js:\"VERTEX_SHADER\""], ["VIEWPORT", "VIEWPORT", "", $Int, "js:\"VIEWPORT\""], ["ZERO", "ZERO", "", $Int, "js:\"ZERO\""]]);
	};
	return $pkg;
})();
$packages["main"] = (function() {
	var $pkg = {}, js = $packages["github.com/gopherjs/gopherjs/js"], webgl = $packages["github.com/gopherjs/webgl"], Tick, main;
	Tick = $pkg.Tick = function() {
		console.log("Tick.");
	};
	main = function() {
		var document, canvas, attrs, _tuple, gl, err;
		document = $global.document;
		canvas = document.createElement($externalize("canvas", $String));
		document.body.appendChild(canvas);
		attrs = webgl.DefaultAttributes();
		attrs.Alpha = false;
		_tuple = webgl.NewContext(canvas, attrs); gl = _tuple[0]; err = _tuple[1];
		if (!($interfaceIsEqual(err, null))) {
			$global.alert($externalize("Error: " + err.Error(), $String));
		}
		gl.ClearColor(0.800000011920929, 0.30000001192092896, 0.009999999776482582, 1);
		gl.Clear($parseInt(gl.Object.COLOR_BUFFER_BIT) >> 0);
		$global.requestAnimationFrame($externalize(Tick, ($funcType([], [], false))));
	};
	$pkg.$run = function($b) {
		$packages["github.com/gopherjs/gopherjs/js"].$init();
		$packages["runtime"].$init();
		$packages["errors"].$init();
		$packages["github.com/gopherjs/webgl"].$init();
		$pkg.$init();
		main();
	};
	$pkg.$init = function() {
	};
	return $pkg;
})();
$error.implementedBy = [$packages["errors"].errorString.Ptr, $packages["github.com/gopherjs/gopherjs/js"].Error.Ptr, $packages["runtime"].NotSupportedError.Ptr, $packages["runtime"].TypeAssertionError.Ptr, $packages["runtime"].errorString, $ptrType($packages["runtime"].errorString)];
$packages["github.com/gopherjs/gopherjs/js"].Object.implementedBy = [$packages["github.com/gopherjs/gopherjs/js"].Error, $packages["github.com/gopherjs/gopherjs/js"].Error.Ptr, $packages["github.com/gopherjs/webgl"].Context, $packages["github.com/gopherjs/webgl"].Context.Ptr];
$go($packages["main"].$run, [], true);

})();
//# sourceMappingURL=main.js.map
