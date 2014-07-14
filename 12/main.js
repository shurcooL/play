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
	var $pkg = {}, js = $packages["github.com/gopherjs/gopherjs/js"], NotSupportedError, TypeAssertionError, errorString, MemStats, sizeof_C_MStats, init, getgoroot, SetFinalizer, GOROOT, init$1;
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
	getgoroot = function() {
		var process, goroot;
		process = $global.process;
		if (process === undefined) {
			return "/";
		}
		goroot = process.env.GOROOT;
		if (goroot === undefined) {
			return "";
		}
		return $internalize(goroot, $String);
	};
	SetFinalizer = $pkg.SetFinalizer = function(x, f) {
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
	GOROOT = $pkg.GOROOT = function() {
		var s;
		s = getgoroot();
		if (!(s === "")) {
			return s;
		}
		return "/usr/local/go";
	};
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
$packages["sync/atomic"] = (function() {
	var $pkg = {}, CompareAndSwapInt32, AddInt32, LoadUint32, StoreInt32, StoreUint32;
	CompareAndSwapInt32 = $pkg.CompareAndSwapInt32 = function(addr, old, new$1) {
		if (addr.$get() === old) {
			addr.$set(new$1);
			return true;
		}
		return false;
	};
	AddInt32 = $pkg.AddInt32 = function(addr, delta) {
		var new$1;
		new$1 = addr.$get() + delta >> 0;
		addr.$set(new$1);
		return new$1;
	};
	LoadUint32 = $pkg.LoadUint32 = function(addr) {
		return addr.$get();
	};
	StoreInt32 = $pkg.StoreInt32 = function(addr, val) {
		addr.$set(val);
	};
	StoreUint32 = $pkg.StoreUint32 = function(addr, val) {
		addr.$set(val);
	};
	$pkg.$init = function() {
	};
	return $pkg;
})();
$packages["sync"] = (function() {
	var $pkg = {}, atomic = $packages["sync/atomic"], runtime = $packages["runtime"], Pool, Mutex, Locker, Once, poolLocal, syncSema, RWMutex, rlocker, allPools, runtime_registerPoolCleanup, runtime_Syncsemcheck, poolCleanup, init, indexLocal, runtime_Semacquire, runtime_Semrelease, init$1;
	Pool = $pkg.Pool = $newType(0, "Struct", "sync.Pool", "Pool", "sync", function(local_, localSize_, store_, New_) {
		this.$val = this;
		this.local = local_ !== undefined ? local_ : 0;
		this.localSize = localSize_ !== undefined ? localSize_ : 0;
		this.store = store_ !== undefined ? store_ : ($sliceType($emptyInterface)).nil;
		this.New = New_ !== undefined ? New_ : $throwNilPointerError;
	});
	Mutex = $pkg.Mutex = $newType(0, "Struct", "sync.Mutex", "Mutex", "sync", function(state_, sema_) {
		this.$val = this;
		this.state = state_ !== undefined ? state_ : 0;
		this.sema = sema_ !== undefined ? sema_ : 0;
	});
	Locker = $pkg.Locker = $newType(8, "Interface", "sync.Locker", "Locker", "sync", null);
	Once = $pkg.Once = $newType(0, "Struct", "sync.Once", "Once", "sync", function(m_, done_) {
		this.$val = this;
		this.m = m_ !== undefined ? m_ : new Mutex.Ptr();
		this.done = done_ !== undefined ? done_ : 0;
	});
	poolLocal = $pkg.poolLocal = $newType(0, "Struct", "sync.poolLocal", "poolLocal", "sync", function(private$0_, shared_, Mutex_, pad_) {
		this.$val = this;
		this.private$0 = private$0_ !== undefined ? private$0_ : null;
		this.shared = shared_ !== undefined ? shared_ : ($sliceType($emptyInterface)).nil;
		this.Mutex = Mutex_ !== undefined ? Mutex_ : new Mutex.Ptr();
		this.pad = pad_ !== undefined ? pad_ : ($arrayType($Uint8, 128)).zero();
	});
	syncSema = $pkg.syncSema = $newType(12, "Array", "sync.syncSema", "syncSema", "sync", null);
	RWMutex = $pkg.RWMutex = $newType(0, "Struct", "sync.RWMutex", "RWMutex", "sync", function(w_, writerSem_, readerSem_, readerCount_, readerWait_) {
		this.$val = this;
		this.w = w_ !== undefined ? w_ : new Mutex.Ptr();
		this.writerSem = writerSem_ !== undefined ? writerSem_ : 0;
		this.readerSem = readerSem_ !== undefined ? readerSem_ : 0;
		this.readerCount = readerCount_ !== undefined ? readerCount_ : 0;
		this.readerWait = readerWait_ !== undefined ? readerWait_ : 0;
	});
	rlocker = $pkg.rlocker = $newType(0, "Struct", "sync.rlocker", "rlocker", "sync", function(w_, writerSem_, readerSem_, readerCount_, readerWait_) {
		this.$val = this;
		this.w = w_ !== undefined ? w_ : new Mutex.Ptr();
		this.writerSem = writerSem_ !== undefined ? writerSem_ : 0;
		this.readerSem = readerSem_ !== undefined ? readerSem_ : 0;
		this.readerCount = readerCount_ !== undefined ? readerCount_ : 0;
		this.readerWait = readerWait_ !== undefined ? readerWait_ : 0;
	});
	Pool.Ptr.prototype.Get = function() {
		var p, x, x$1, x$2;
		p = this;
		if (p.store.$length === 0) {
			if (!(p.New === $throwNilPointerError)) {
				return p.New();
			}
			return null;
		}
		x$2 = (x = p.store, x$1 = p.store.$length - 1 >> 0, ((x$1 < 0 || x$1 >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + x$1]));
		p.store = $subslice(p.store, 0, (p.store.$length - 1 >> 0));
		return x$2;
	};
	Pool.prototype.Get = function() { return this.$val.Get(); };
	Pool.Ptr.prototype.Put = function(x) {
		var p;
		p = this;
		if ($interfaceIsEqual(x, null)) {
			return;
		}
		p.store = $append(p.store, x);
	};
	Pool.prototype.Put = function(x) { return this.$val.Put(x); };
	runtime_registerPoolCleanup = function(cleanup) {
	};
	runtime_Syncsemcheck = function(size) {
	};
	Mutex.Ptr.prototype.Lock = function() {
		var m, awoke, old, new$1;
		m = this;
		if (atomic.CompareAndSwapInt32(new ($ptrType($Int32))(function() { return this.$target.state; }, function($v) { this.$target.state = $v; }, m), 0, 1)) {
			return;
		}
		awoke = false;
		while (true) {
			old = m.state;
			new$1 = old | 1;
			if (!(((old & 1) === 0))) {
				new$1 = old + 4 >> 0;
			}
			if (awoke) {
				new$1 = new$1 & ~(2);
			}
			if (atomic.CompareAndSwapInt32(new ($ptrType($Int32))(function() { return this.$target.state; }, function($v) { this.$target.state = $v; }, m), old, new$1)) {
				if ((old & 1) === 0) {
					break;
				}
				runtime_Semacquire(new ($ptrType($Uint32))(function() { return this.$target.sema; }, function($v) { this.$target.sema = $v; }, m));
				awoke = true;
			}
		}
	};
	Mutex.prototype.Lock = function() { return this.$val.Lock(); };
	Mutex.Ptr.prototype.Unlock = function() {
		var m, new$1, old;
		m = this;
		new$1 = atomic.AddInt32(new ($ptrType($Int32))(function() { return this.$target.state; }, function($v) { this.$target.state = $v; }, m), -1);
		if ((((new$1 + 1 >> 0)) & 1) === 0) {
			$panic(new $String("sync: unlock of unlocked mutex"));
		}
		old = new$1;
		while (true) {
			if (((old >> 2 >> 0) === 0) || !(((old & 3) === 0))) {
				return;
			}
			new$1 = ((old - 4 >> 0)) | 2;
			if (atomic.CompareAndSwapInt32(new ($ptrType($Int32))(function() { return this.$target.state; }, function($v) { this.$target.state = $v; }, m), old, new$1)) {
				runtime_Semrelease(new ($ptrType($Uint32))(function() { return this.$target.sema; }, function($v) { this.$target.sema = $v; }, m));
				return;
			}
			old = m.state;
		}
	};
	Mutex.prototype.Unlock = function() { return this.$val.Unlock(); };
	Once.Ptr.prototype.Do = function(f) {
		var $deferred = [], $err = null, o;
		/* */ try { $deferFrames.push($deferred);
		o = this;
		if (atomic.LoadUint32(new ($ptrType($Uint32))(function() { return this.$target.done; }, function($v) { this.$target.done = $v; }, o)) === 1) {
			return;
		}
		o.m.Lock();
		$deferred.push([$methodVal(o.m, "Unlock"), []]);
		if (o.done === 0) {
			f();
			atomic.StoreUint32(new ($ptrType($Uint32))(function() { return this.$target.done; }, function($v) { this.$target.done = $v; }, o), 1);
		}
		/* */ } catch(err) { $err = err; } finally { $deferFrames.pop(); $callDeferred($deferred, $err); }
	};
	Once.prototype.Do = function(f) { return this.$val.Do(f); };
	poolCleanup = function() {
		var _ref, _i, i, p, i$1, l, _ref$1, _i$1, j, x;
		_ref = allPools;
		_i = 0;
		while (_i < _ref.$length) {
			i = _i;
			p = ((_i < 0 || _i >= _ref.$length) ? $throwRuntimeError("index out of range") : _ref.$array[_ref.$offset + _i]);
			(i < 0 || i >= allPools.$length) ? $throwRuntimeError("index out of range") : allPools.$array[allPools.$offset + i] = ($ptrType(Pool)).nil;
			i$1 = 0;
			while (i$1 < (p.localSize >> 0)) {
				l = indexLocal(p.local, i$1);
				l.private$0 = null;
				_ref$1 = l.shared;
				_i$1 = 0;
				while (_i$1 < _ref$1.$length) {
					j = _i$1;
					(x = l.shared, (j < 0 || j >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + j] = null);
					_i$1++;
				}
				l.shared = ($sliceType($emptyInterface)).nil;
				i$1 = i$1 + (1) >> 0;
			}
			_i++;
		}
		allPools = new ($sliceType(($ptrType(Pool))))([]);
	};
	init = function() {
		runtime_registerPoolCleanup(poolCleanup);
	};
	indexLocal = function(l, i) {
		var x;
		return (x = l, (x.nilCheck, ((i < 0 || i >= x.length) ? $throwRuntimeError("index out of range") : x[i])));
	};
	runtime_Semacquire = function() {
		$panic("Native function not implemented: sync.runtime_Semacquire");
	};
	runtime_Semrelease = function() {
		$panic("Native function not implemented: sync.runtime_Semrelease");
	};
	init$1 = function() {
		var s;
		s = syncSema.zero(); $copy(s, syncSema.zero(), syncSema);
		runtime_Syncsemcheck(12);
	};
	RWMutex.Ptr.prototype.RLock = function() {
		var rw;
		rw = this;
		if (atomic.AddInt32(new ($ptrType($Int32))(function() { return this.$target.readerCount; }, function($v) { this.$target.readerCount = $v; }, rw), 1) < 0) {
			runtime_Semacquire(new ($ptrType($Uint32))(function() { return this.$target.readerSem; }, function($v) { this.$target.readerSem = $v; }, rw));
		}
	};
	RWMutex.prototype.RLock = function() { return this.$val.RLock(); };
	RWMutex.Ptr.prototype.RUnlock = function() {
		var rw;
		rw = this;
		if (atomic.AddInt32(new ($ptrType($Int32))(function() { return this.$target.readerCount; }, function($v) { this.$target.readerCount = $v; }, rw), -1) < 0) {
			if (atomic.AddInt32(new ($ptrType($Int32))(function() { return this.$target.readerWait; }, function($v) { this.$target.readerWait = $v; }, rw), -1) === 0) {
				runtime_Semrelease(new ($ptrType($Uint32))(function() { return this.$target.writerSem; }, function($v) { this.$target.writerSem = $v; }, rw));
			}
		}
	};
	RWMutex.prototype.RUnlock = function() { return this.$val.RUnlock(); };
	RWMutex.Ptr.prototype.Lock = function() {
		var rw, r;
		rw = this;
		rw.w.Lock();
		r = atomic.AddInt32(new ($ptrType($Int32))(function() { return this.$target.readerCount; }, function($v) { this.$target.readerCount = $v; }, rw), -1073741824) + 1073741824 >> 0;
		if (!((r === 0)) && !((atomic.AddInt32(new ($ptrType($Int32))(function() { return this.$target.readerWait; }, function($v) { this.$target.readerWait = $v; }, rw), r) === 0))) {
			runtime_Semacquire(new ($ptrType($Uint32))(function() { return this.$target.writerSem; }, function($v) { this.$target.writerSem = $v; }, rw));
		}
	};
	RWMutex.prototype.Lock = function() { return this.$val.Lock(); };
	RWMutex.Ptr.prototype.Unlock = function() {
		var rw, r, i;
		rw = this;
		r = atomic.AddInt32(new ($ptrType($Int32))(function() { return this.$target.readerCount; }, function($v) { this.$target.readerCount = $v; }, rw), 1073741824);
		i = 0;
		while (i < (r >> 0)) {
			runtime_Semrelease(new ($ptrType($Uint32))(function() { return this.$target.readerSem; }, function($v) { this.$target.readerSem = $v; }, rw));
			i = i + (1) >> 0;
		}
		rw.w.Unlock();
	};
	RWMutex.prototype.Unlock = function() { return this.$val.Unlock(); };
	RWMutex.Ptr.prototype.RLocker = function() {
		var rw;
		rw = this;
		return $clone(rw, rlocker);
	};
	RWMutex.prototype.RLocker = function() { return this.$val.RLocker(); };
	rlocker.Ptr.prototype.Lock = function() {
		var r;
		r = this;
		$clone(r, RWMutex).RLock();
	};
	rlocker.prototype.Lock = function() { return this.$val.Lock(); };
	rlocker.Ptr.prototype.Unlock = function() {
		var r;
		r = this;
		$clone(r, RWMutex).RUnlock();
	};
	rlocker.prototype.Unlock = function() { return this.$val.Unlock(); };
	$pkg.$init = function() {
		($ptrType(Pool)).methods = [["Get", "Get", "", [], [$emptyInterface], false, -1], ["Put", "Put", "", [$emptyInterface], [], false, -1], ["getSlow", "getSlow", "sync", [], [$emptyInterface], false, -1], ["pin", "pin", "sync", [], [($ptrType(poolLocal))], false, -1], ["pinSlow", "pinSlow", "sync", [], [($ptrType(poolLocal))], false, -1]];
		Pool.init([["local", "local", "sync", $UnsafePointer, ""], ["localSize", "localSize", "sync", $Uintptr, ""], ["store", "store", "sync", ($sliceType($emptyInterface)), ""], ["New", "New", "", ($funcType([], [$emptyInterface], false)), ""]]);
		($ptrType(Mutex)).methods = [["Lock", "Lock", "", [], [], false, -1], ["Unlock", "Unlock", "", [], [], false, -1]];
		Mutex.init([["state", "state", "sync", $Int32, ""], ["sema", "sema", "sync", $Uint32, ""]]);
		Locker.init([["Lock", "Lock", "", [], [], false], ["Unlock", "Unlock", "", [], [], false]]);
		($ptrType(Once)).methods = [["Do", "Do", "", [($funcType([], [], false))], [], false, -1]];
		Once.init([["m", "m", "sync", Mutex, ""], ["done", "done", "sync", $Uint32, ""]]);
		($ptrType(poolLocal)).methods = [["Lock", "Lock", "", [], [], false, 2], ["Unlock", "Unlock", "", [], [], false, 2]];
		poolLocal.init([["private$0", "private", "sync", $emptyInterface, ""], ["shared", "shared", "sync", ($sliceType($emptyInterface)), ""], ["Mutex", "", "", Mutex, ""], ["pad", "pad", "sync", ($arrayType($Uint8, 128)), ""]]);
		syncSema.init($Uintptr, 3);
		($ptrType(RWMutex)).methods = [["Lock", "Lock", "", [], [], false, -1], ["RLock", "RLock", "", [], [], false, -1], ["RLocker", "RLocker", "", [], [Locker], false, -1], ["RUnlock", "RUnlock", "", [], [], false, -1], ["Unlock", "Unlock", "", [], [], false, -1]];
		RWMutex.init([["w", "w", "sync", Mutex, ""], ["writerSem", "writerSem", "sync", $Uint32, ""], ["readerSem", "readerSem", "sync", $Uint32, ""], ["readerCount", "readerCount", "sync", $Int32, ""], ["readerWait", "readerWait", "sync", $Int32, ""]]);
		($ptrType(rlocker)).methods = [["Lock", "Lock", "", [], [], false, -1], ["Unlock", "Unlock", "", [], [], false, -1]];
		rlocker.init([["w", "w", "sync", Mutex, ""], ["writerSem", "writerSem", "sync", $Uint32, ""], ["readerSem", "readerSem", "sync", $Uint32, ""], ["readerCount", "readerCount", "sync", $Int32, ""], ["readerWait", "readerWait", "sync", $Int32, ""]]);
		allPools = ($sliceType(($ptrType(Pool)))).nil;
		init();
		init$1();
	};
	return $pkg;
})();
$packages["io"] = (function() {
	var $pkg = {}, runtime = $packages["runtime"], errors = $packages["errors"], sync = $packages["sync"], RuneReader, errWhence, errOffset;
	RuneReader = $pkg.RuneReader = $newType(8, "Interface", "io.RuneReader", "RuneReader", "io", null);
	$pkg.$init = function() {
		RuneReader.init([["ReadRune", "ReadRune", "", [], [$Int32, $Int, $error], false]]);
		$pkg.ErrShortWrite = errors.New("short write");
		$pkg.ErrShortBuffer = errors.New("short buffer");
		$pkg.EOF = errors.New("EOF");
		$pkg.ErrUnexpectedEOF = errors.New("unexpected EOF");
		$pkg.ErrNoProgress = errors.New("multiple Read calls return no data or error");
		errWhence = errors.New("Seek: invalid whence");
		errOffset = errors.New("Seek: invalid offset");
		$pkg.ErrClosedPipe = errors.New("io: read/write on closed pipe");
	};
	return $pkg;
})();
$packages["math"] = (function() {
	var $pkg = {}, js = $packages["github.com/gopherjs/gopherjs/js"], math, zero, posInf, negInf, nan, pow10tab, init, IsInf, Ldexp, Float32bits, Float32frombits, Float64bits, init$1;
	init = function() {
		Float32bits(0);
		Float32frombits(0);
	};
	IsInf = $pkg.IsInf = function(f, sign) {
		if (f === posInf) {
			return sign >= 0;
		}
		if (f === negInf) {
			return sign <= 0;
		}
		return false;
	};
	Ldexp = $pkg.Ldexp = function(frac, exp$1) {
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
		var s, e, r;
		if ($float32IsEqual(f, 0)) {
			if ($float32IsEqual(1 / f, negInf)) {
				return 2147483648;
			}
			return 0;
		}
		if (!(($float32IsEqual(f, f)))) {
			return 2143289344;
		}
		s = 0;
		if (f < 0) {
			s = 2147483648;
			f = -f;
		}
		e = 150;
		while (f >= 1.6777216e+07) {
			f = f / (2);
			if (e === 255) {
				break;
			}
			e = e + (1) >>> 0;
		}
		while (f < 8.388608e+06) {
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
		var s, e, m;
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
		var s, e, x, x$1, x$2, x$3;
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
		while (f >= 9.007199254740992e+15) {
			f = f / (2);
			if (e === 2047) {
				break;
			}
			e = e + (1) >>> 0;
		}
		while (f < 4.503599627370496e+15) {
			e = e - (1) >>> 0;
			if (e === 0) {
				break;
			}
			f = f * (2);
		}
		return (x = (x$1 = $shiftLeft64(new $Uint64(0, e), 52), new $Uint64(s.$high | x$1.$high, (s.$low | x$1.$low) >>> 0)), x$2 = (x$3 = new $Uint64(0, f), new $Uint64(x$3.$high &~ 1048576, (x$3.$low &~ 0) >>> 0)), new $Uint64(x.$high | x$2.$high, (x.$low | x$2.$low) >>> 0));
	};
	init$1 = function() {
		var i, _q, m, x;
		pow10tab[0] = 1;
		pow10tab[1] = 10;
		i = 2;
		while (i < 70) {
			m = (_q = i / 2, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero"));
			(i < 0 || i >= pow10tab.length) ? $throwRuntimeError("index out of range") : pow10tab[i] = ((m < 0 || m >= pow10tab.length) ? $throwRuntimeError("index out of range") : pow10tab[m]) * (x = i - m >> 0, ((x < 0 || x >= pow10tab.length) ? $throwRuntimeError("index out of range") : pow10tab[x]));
			i = i + (1) >> 0;
		}
	};
	$pkg.$init = function() {
		pow10tab = ($arrayType($Float64, 70)).zero();
		math = $global.Math;
		zero = 0;
		posInf = 1 / zero;
		negInf = -1 / zero;
		nan = 0 / zero;
		init();
		init$1();
	};
	return $pkg;
})();
$packages["unicode"] = (function() {
	var $pkg = {};
	$pkg.$init = function() {
	};
	return $pkg;
})();
$packages["unicode/utf8"] = (function() {
	var $pkg = {}, decodeRuneInStringInternal, DecodeRuneInString, RuneLen, EncodeRune, RuneCountInString;
	decodeRuneInStringInternal = function(s) {
		var r = 0, size = 0, short$1 = false, n, _tmp, _tmp$1, _tmp$2, c0, _tmp$3, _tmp$4, _tmp$5, _tmp$6, _tmp$7, _tmp$8, _tmp$9, _tmp$10, _tmp$11, c1, _tmp$12, _tmp$13, _tmp$14, _tmp$15, _tmp$16, _tmp$17, _tmp$18, _tmp$19, _tmp$20, _tmp$21, _tmp$22, _tmp$23, c2, _tmp$24, _tmp$25, _tmp$26, _tmp$27, _tmp$28, _tmp$29, _tmp$30, _tmp$31, _tmp$32, _tmp$33, _tmp$34, _tmp$35, _tmp$36, _tmp$37, _tmp$38, c3, _tmp$39, _tmp$40, _tmp$41, _tmp$42, _tmp$43, _tmp$44, _tmp$45, _tmp$46, _tmp$47, _tmp$48, _tmp$49, _tmp$50;
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
	DecodeRuneInString = $pkg.DecodeRuneInString = function(s) {
		var r = 0, size = 0, _tuple;
		_tuple = decodeRuneInStringInternal(s); r = _tuple[0]; size = _tuple[1];
		return [r, size];
	};
	RuneLen = $pkg.RuneLen = function(r) {
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
		var i;
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
	RuneCountInString = $pkg.RuneCountInString = function(s) {
		var n = 0, _ref, _i, _rune;
		_ref = s;
		_i = 0;
		while (_i < _ref.length) {
			_rune = $decodeRune(_ref, _i);
			n = n + (1) >> 0;
			_i += _rune[1];
		}
		return n;
	};
	$pkg.$init = function() {
	};
	return $pkg;
})();
$packages["bytes"] = (function() {
	var $pkg = {}, errors = $packages["errors"], io = $packages["io"], utf8 = $packages["unicode/utf8"], unicode = $packages["unicode"], IndexByte;
	IndexByte = $pkg.IndexByte = function(s, c) {
		var _ref, _i, i, b;
		_ref = s;
		_i = 0;
		while (_i < _ref.$length) {
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
		$pkg.ErrTooLarge = errors.New("bytes.Buffer: too large");
	};
	return $pkg;
})();
$packages["syscall"] = (function() {
	var $pkg = {}, bytes = $packages["bytes"], js = $packages["github.com/gopherjs/gopherjs/js"], sync = $packages["sync"], runtime = $packages["runtime"], errors = $packages["errors"], mmapper, Errno, _C_int, Timespec, Stat_t, Dirent, warningPrinted, lineBuffer, syscallModule, alreadyTriedToLoad, minusOne, envOnce, envLock, env, envs, mapper, errors$1, printWarning, printToConsole, init, syscall, Syscall, Syscall6, BytePtrFromString, copyenv, Getenv, itoa, ByteSliceFromString, ReadDirent, Sysctl, nametomib, ParseDirent, Read, Write, sysctl, Close, Fchdir, Fchmod, Fchown, Fstat, Fsync, Ftruncate, Getdirentries, Lstat, Pread, Pwrite, read, Seek, write, mmap, munmap;
	mmapper = $pkg.mmapper = $newType(0, "Struct", "syscall.mmapper", "mmapper", "syscall", function(Mutex_, active_, mmap_, munmap_) {
		this.$val = this;
		this.Mutex = Mutex_ !== undefined ? Mutex_ : new sync.Mutex.Ptr();
		this.active = active_ !== undefined ? active_ : false;
		this.mmap = mmap_ !== undefined ? mmap_ : $throwNilPointerError;
		this.munmap = munmap_ !== undefined ? munmap_ : $throwNilPointerError;
	});
	Errno = $pkg.Errno = $newType(4, "Uintptr", "syscall.Errno", "Errno", "syscall", null);
	_C_int = $pkg._C_int = $newType(4, "Int32", "syscall._C_int", "_C_int", "syscall", null);
	Timespec = $pkg.Timespec = $newType(0, "Struct", "syscall.Timespec", "Timespec", "syscall", function(Sec_, Nsec_) {
		this.$val = this;
		this.Sec = Sec_ !== undefined ? Sec_ : new $Int64(0, 0);
		this.Nsec = Nsec_ !== undefined ? Nsec_ : new $Int64(0, 0);
	});
	Stat_t = $pkg.Stat_t = $newType(0, "Struct", "syscall.Stat_t", "Stat_t", "syscall", function(Dev_, Mode_, Nlink_, Ino_, Uid_, Gid_, Rdev_, Pad_cgo_0_, Atimespec_, Mtimespec_, Ctimespec_, Birthtimespec_, Size_, Blocks_, Blksize_, Flags_, Gen_, Lspare_, Qspare_) {
		this.$val = this;
		this.Dev = Dev_ !== undefined ? Dev_ : 0;
		this.Mode = Mode_ !== undefined ? Mode_ : 0;
		this.Nlink = Nlink_ !== undefined ? Nlink_ : 0;
		this.Ino = Ino_ !== undefined ? Ino_ : new $Uint64(0, 0);
		this.Uid = Uid_ !== undefined ? Uid_ : 0;
		this.Gid = Gid_ !== undefined ? Gid_ : 0;
		this.Rdev = Rdev_ !== undefined ? Rdev_ : 0;
		this.Pad_cgo_0 = Pad_cgo_0_ !== undefined ? Pad_cgo_0_ : ($arrayType($Uint8, 4)).zero();
		this.Atimespec = Atimespec_ !== undefined ? Atimespec_ : new Timespec.Ptr();
		this.Mtimespec = Mtimespec_ !== undefined ? Mtimespec_ : new Timespec.Ptr();
		this.Ctimespec = Ctimespec_ !== undefined ? Ctimespec_ : new Timespec.Ptr();
		this.Birthtimespec = Birthtimespec_ !== undefined ? Birthtimespec_ : new Timespec.Ptr();
		this.Size = Size_ !== undefined ? Size_ : new $Int64(0, 0);
		this.Blocks = Blocks_ !== undefined ? Blocks_ : new $Int64(0, 0);
		this.Blksize = Blksize_ !== undefined ? Blksize_ : 0;
		this.Flags = Flags_ !== undefined ? Flags_ : 0;
		this.Gen = Gen_ !== undefined ? Gen_ : 0;
		this.Lspare = Lspare_ !== undefined ? Lspare_ : 0;
		this.Qspare = Qspare_ !== undefined ? Qspare_ : ($arrayType($Int64, 2)).zero();
	});
	Dirent = $pkg.Dirent = $newType(0, "Struct", "syscall.Dirent", "Dirent", "syscall", function(Ino_, Seekoff_, Reclen_, Namlen_, Type_, Name_, Pad_cgo_0_) {
		this.$val = this;
		this.Ino = Ino_ !== undefined ? Ino_ : new $Uint64(0, 0);
		this.Seekoff = Seekoff_ !== undefined ? Seekoff_ : new $Uint64(0, 0);
		this.Reclen = Reclen_ !== undefined ? Reclen_ : 0;
		this.Namlen = Namlen_ !== undefined ? Namlen_ : 0;
		this.Type = Type_ !== undefined ? Type_ : 0;
		this.Name = Name_ !== undefined ? Name_ : ($arrayType($Int8, 1024)).zero();
		this.Pad_cgo_0 = Pad_cgo_0_ !== undefined ? Pad_cgo_0_ : ($arrayType($Uint8, 3)).zero();
	});
	printWarning = function() {
		if (!warningPrinted) {
			console.log("warning: system calls not available, see https://github.com/gopherjs/gopherjs/blob/master/doc/syscalls.md");
		}
		warningPrinted = true;
	};
	printToConsole = function(b) {
		var goPrintToConsole, i;
		goPrintToConsole = $global.goPrintToConsole;
		if (!(goPrintToConsole === undefined)) {
			goPrintToConsole(b);
			return;
		}
		lineBuffer = $appendSlice(lineBuffer, b);
		while (true) {
			i = bytes.IndexByte(lineBuffer, 10);
			if (i === -1) {
				break;
			}
			$global.console.log($externalize($bytesToString($subslice(lineBuffer, 0, i)), $String));
			lineBuffer = $subslice(lineBuffer, (i + 1 >> 0));
		}
	};
	init = function() {
		var process, jsEnv, envkeys, i, key;
		process = $global.process;
		if (!(process === undefined)) {
			jsEnv = process.env;
			envkeys = $global.Object.keys(jsEnv);
			envs = ($sliceType($String)).make($parseInt(envkeys.length));
			i = 0;
			while (i < $parseInt(envkeys.length)) {
				key = $internalize(envkeys[i], $String);
				(i < 0 || i >= envs.$length) ? $throwRuntimeError("index out of range") : envs.$array[envs.$offset + i] = key + "=" + $internalize(jsEnv[$externalize(key, $String)], $String);
				i = i + (1) >> 0;
			}
		}
	};
	syscall = function(name) {
		var $deferred = [], $err = null, require;
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
		var r1 = 0, r2 = 0, err = 0, f, r, _tmp, _tmp$1, _tmp$2, array, slice, _tmp$3, _tmp$4, _tmp$5, _tmp$6, _tmp$7, _tmp$8;
		f = syscall("Syscall");
		if (!(f === null)) {
			r = f(trap, a1, a2, a3);
			_tmp = (($parseInt(r[0]) >> 0) >>> 0); _tmp$1 = (($parseInt(r[1]) >> 0) >>> 0); _tmp$2 = (($parseInt(r[2]) >> 0) >>> 0); r1 = _tmp; r2 = _tmp$1; err = _tmp$2;
			return [r1, r2, err];
		}
		if ((trap === 4) && ((a1 === 1) || (a1 === 2))) {
			array = a2;
			slice = ($sliceType($Uint8)).make($parseInt(array.length));
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
		var r1 = 0, r2 = 0, err = 0, f, r, _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5;
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
		var array, _ref, _i, i, b;
		array = new ($global.Uint8Array)(s.length + 1 >> 0);
		_ref = new ($sliceType($Uint8))($stringToBytes(s));
		_i = 0;
		while (_i < _ref.$length) {
			i = _i;
			b = ((_i < 0 || _i >= _ref.$length) ? $throwRuntimeError("index out of range") : _ref.$array[_ref.$offset + _i]);
			if (b === 0) {
				return [($ptrType($Uint8)).nil, new Errno(22)];
			}
			array[i] = b;
			_i++;
		}
		array[s.length] = 0;
		return [array, null];
	};
	copyenv = function() {
		var _ref, _i, i, s, j, key, _tuple, _entry, ok, _key;
		env = new $Map();
		_ref = envs;
		_i = 0;
		while (_i < _ref.$length) {
			i = _i;
			s = ((_i < 0 || _i >= _ref.$length) ? $throwRuntimeError("index out of range") : _ref.$array[_ref.$offset + _i]);
			j = 0;
			while (j < s.length) {
				if (s.charCodeAt(j) === 61) {
					key = s.substring(0, j);
					_tuple = (_entry = env[key], _entry !== undefined ? [_entry.v, true] : [0, false]); ok = _tuple[1];
					if (!ok) {
						_key = key; (env || $throwRuntimeError("assignment to entry in nil map"))[_key] = { k: _key, v: i };
					}
					break;
				}
				j = j + (1) >> 0;
			}
			_i++;
		}
	};
	Getenv = $pkg.Getenv = function(key) {
		var value = "", found = false, $deferred = [], $err = null, _tmp, _tmp$1, _tuple, _entry, i, ok, _tmp$2, _tmp$3, s, i$1, _tmp$4, _tmp$5, _tmp$6, _tmp$7;
		/* */ try { $deferFrames.push($deferred);
		envOnce.Do(copyenv);
		if (key.length === 0) {
			_tmp = ""; _tmp$1 = false; value = _tmp; found = _tmp$1;
			return [value, found];
		}
		envLock.RLock();
		$deferred.push([$methodVal(envLock, "RUnlock"), []]);
		_tuple = (_entry = env[key], _entry !== undefined ? [_entry.v, true] : [0, false]); i = _tuple[0]; ok = _tuple[1];
		if (!ok) {
			_tmp$2 = ""; _tmp$3 = false; value = _tmp$2; found = _tmp$3;
			return [value, found];
		}
		s = ((i < 0 || i >= envs.$length) ? $throwRuntimeError("index out of range") : envs.$array[envs.$offset + i]);
		i$1 = 0;
		while (i$1 < s.length) {
			if (s.charCodeAt(i$1) === 61) {
				_tmp$4 = s.substring((i$1 + 1 >> 0)); _tmp$5 = true; value = _tmp$4; found = _tmp$5;
				return [value, found];
			}
			i$1 = i$1 + (1) >> 0;
		}
		_tmp$6 = ""; _tmp$7 = false; value = _tmp$6; found = _tmp$7;
		return [value, found];
		/* */ } catch(err) { $err = err; } finally { $deferFrames.pop(); $callDeferred($deferred, $err); return [value, found]; }
	};
	itoa = function(val) {
		var buf, i, _r, _q;
		if (val < 0) {
			return "-" + itoa(-val);
		}
		buf = ($arrayType($Uint8, 32)).zero(); $copy(buf, ($arrayType($Uint8, 32)).zero(), ($arrayType($Uint8, 32)));
		i = 31;
		while (val >= 10) {
			(i < 0 || i >= buf.length) ? $throwRuntimeError("index out of range") : buf[i] = (((_r = val % 10, _r === _r ? _r : $throwRuntimeError("integer divide by zero")) + 48 >> 0) << 24 >>> 24);
			i = i - (1) >> 0;
			val = (_q = val / (10), (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero"));
		}
		(i < 0 || i >= buf.length) ? $throwRuntimeError("index out of range") : buf[i] = ((val + 48 >> 0) << 24 >>> 24);
		return $bytesToString($subslice(new ($sliceType($Uint8))(buf), i));
	};
	ByteSliceFromString = $pkg.ByteSliceFromString = function(s) {
		var i, a;
		i = 0;
		while (i < s.length) {
			if (s.charCodeAt(i) === 0) {
				return [($sliceType($Uint8)).nil, new Errno(22)];
			}
			i = i + (1) >> 0;
		}
		a = ($sliceType($Uint8)).make((s.length + 1 >> 0));
		$copyString(a, s);
		return [a, null];
	};
	Timespec.Ptr.prototype.Unix = function() {
		var sec = new $Int64(0, 0), nsec = new $Int64(0, 0), ts, _tmp, _tmp$1;
		ts = this;
		_tmp = ts.Sec; _tmp$1 = ts.Nsec; sec = _tmp; nsec = _tmp$1;
		return [sec, nsec];
	};
	Timespec.prototype.Unix = function() { return this.$val.Unix(); };
	Timespec.Ptr.prototype.Nano = function() {
		var ts, x, x$1;
		ts = this;
		return (x = $mul64(ts.Sec, new $Int64(0, 1000000000)), x$1 = ts.Nsec, new $Int64(x.$high + x$1.$high, x.$low + x$1.$low));
	};
	Timespec.prototype.Nano = function() { return this.$val.Nano(); };
	ReadDirent = $pkg.ReadDirent = function(fd, buf) {
		var n = 0, err = null, base, _tuple;
		base = new Uint8Array(8);
		_tuple = Getdirentries(fd, buf, base); n = _tuple[0]; err = _tuple[1];
		return [n, err];
	};
	Sysctl = $pkg.Sysctl = function(name) {
		var value = "", err = null, _tuple, mib, _tmp, _tmp$1, n, _tmp$2, _tmp$3, _tmp$4, _tmp$5, buf, _tmp$6, _tmp$7, x, _tmp$8, _tmp$9;
		_tuple = nametomib(name); mib = _tuple[0]; err = _tuple[1];
		if (!($interfaceIsEqual(err, null))) {
			_tmp = ""; _tmp$1 = err; value = _tmp; err = _tmp$1;
			return [value, err];
		}
		n = 0;
		err = sysctl(mib, ($ptrType($Uint8)).nil, new ($ptrType($Uintptr))(function() { return n; }, function($v) { n = $v; }), ($ptrType($Uint8)).nil, 0);
		if (!($interfaceIsEqual(err, null))) {
			_tmp$2 = ""; _tmp$3 = err; value = _tmp$2; err = _tmp$3;
			return [value, err];
		}
		if (n === 0) {
			_tmp$4 = ""; _tmp$5 = null; value = _tmp$4; err = _tmp$5;
			return [value, err];
		}
		buf = ($sliceType($Uint8)).make(n);
		err = sysctl(mib, new ($ptrType($Uint8))(function() { return ((0 < 0 || 0 >= this.$target.$length) ? $throwRuntimeError("index out of range") : this.$target.$array[this.$target.$offset + 0]); }, function($v) { (0 < 0 || 0 >= this.$target.$length) ? $throwRuntimeError("index out of range") : this.$target.$array[this.$target.$offset + 0] = $v; }, buf), new ($ptrType($Uintptr))(function() { return n; }, function($v) { n = $v; }), ($ptrType($Uint8)).nil, 0);
		if (!($interfaceIsEqual(err, null))) {
			_tmp$6 = ""; _tmp$7 = err; value = _tmp$6; err = _tmp$7;
			return [value, err];
		}
		if (n > 0 && ((x = n - 1 >>> 0, ((x < 0 || x >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + x])) === 0)) {
			n = n - (1) >>> 0;
		}
		_tmp$8 = $bytesToString($subslice(buf, 0, n)); _tmp$9 = null; value = _tmp$8; err = _tmp$9;
		return [value, err];
	};
	nametomib = function(name) {
		var mib = ($sliceType(_C_int)).nil, err = null, buf, n, p, _tuple, bytes$1, _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _q, _tmp$5;
		buf = ($arrayType(_C_int, 14)).zero(); $copy(buf, ($arrayType(_C_int, 14)).zero(), ($arrayType(_C_int, 14)));
		n = 48;
		p = $sliceToArray(new ($sliceType($Uint8))(buf));
		_tuple = ByteSliceFromString(name); bytes$1 = _tuple[0]; err = _tuple[1];
		if (!($interfaceIsEqual(err, null))) {
			_tmp = ($sliceType(_C_int)).nil; _tmp$1 = err; mib = _tmp; err = _tmp$1;
			return [mib, err];
		}
		err = sysctl(new ($sliceType(_C_int))([0, 3]), p, new ($ptrType($Uintptr))(function() { return n; }, function($v) { n = $v; }), new ($ptrType($Uint8))(function() { return ((0 < 0 || 0 >= this.$target.$length) ? $throwRuntimeError("index out of range") : this.$target.$array[this.$target.$offset + 0]); }, function($v) { (0 < 0 || 0 >= this.$target.$length) ? $throwRuntimeError("index out of range") : this.$target.$array[this.$target.$offset + 0] = $v; }, bytes$1), (name.length >>> 0));
		if (!($interfaceIsEqual(err, null))) {
			_tmp$2 = ($sliceType(_C_int)).nil; _tmp$3 = err; mib = _tmp$2; err = _tmp$3;
			return [mib, err];
		}
		_tmp$4 = $subslice(new ($sliceType(_C_int))(buf), 0, (_q = n / 4, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >>> 0 : $throwRuntimeError("integer divide by zero"))); _tmp$5 = null; mib = _tmp$4; err = _tmp$5;
		return [mib, err];
	};
	ParseDirent = $pkg.ParseDirent = function(buf, max, names) {
		var consumed = 0, count = 0, newnames = ($sliceType($String)).nil, origlen, dirent, _array, _struct, _view, x, bytes$1, name, _tmp, _tmp$1, _tmp$2;
		origlen = buf.$length;
		while (!((max === 0)) && buf.$length > 0) {
			dirent = [undefined];
			dirent[0] = (_array = $sliceToArray(buf), _struct = new Dirent.Ptr(), _view = new DataView(_array.buffer, _array.byteOffset), _struct.Ino = new $Uint64(_view.getUint32(4, true), _view.getUint32(0, true)), _struct.Seekoff = new $Uint64(_view.getUint32(12, true), _view.getUint32(8, true)), _struct.Reclen = _view.getUint16(16, true), _struct.Namlen = _view.getUint16(18, true), _struct.Type = _view.getUint8(20, true), _struct.Name = new ($nativeArray("Int8"))(_array.buffer, $min(_array.byteOffset + 21, _array.buffer.byteLength)), _struct.Pad_cgo_0 = new ($nativeArray("Uint8"))(_array.buffer, $min(_array.byteOffset + 1045, _array.buffer.byteLength)), _struct);
			if (dirent[0].Reclen === 0) {
				buf = ($sliceType($Uint8)).nil;
				break;
			}
			buf = $subslice(buf, dirent[0].Reclen);
			if ((x = dirent[0].Ino, (x.$high === 0 && x.$low === 0))) {
				continue;
			}
			bytes$1 = $sliceToArray(new ($sliceType($Uint8))(dirent[0].Name));
			name = $bytesToString($subslice(new ($sliceType($Uint8))(bytes$1), 0, dirent[0].Namlen));
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
	mmapper.Ptr.prototype.Mmap = function(fd, offset, length, prot, flags) {
		var data = ($sliceType($Uint8)).nil, err = null, $deferred = [], $err = null, m, _tmp, _tmp$1, _tuple, addr, errno, _tmp$2, _tmp$3, sl, b, x, x$1, p, _key, _tmp$4, _tmp$5;
		/* */ try { $deferFrames.push($deferred);
		m = this;
		if (length <= 0) {
			_tmp = ($sliceType($Uint8)).nil; _tmp$1 = new Errno(22); data = _tmp; err = _tmp$1;
			return [data, err];
		}
		_tuple = m.mmap(0, (length >>> 0), prot, flags, fd, offset); addr = _tuple[0]; errno = _tuple[1];
		if (!($interfaceIsEqual(errno, null))) {
			_tmp$2 = ($sliceType($Uint8)).nil; _tmp$3 = errno; data = _tmp$2; err = _tmp$3;
			return [data, err];
		}
		sl = new ($structType([["addr", "addr", "syscall", $Uintptr, ""], ["len", "len", "syscall", $Int, ""], ["cap", "cap", "syscall", $Int, ""]])).Ptr(addr, length, length);
		b = sl;
		p = new ($ptrType($Uint8))(function() { return (x$1 = b.$capacity - 1 >> 0, ((x$1 < 0 || x$1 >= this.$target.$length) ? $throwRuntimeError("index out of range") : this.$target.$array[this.$target.$offset + x$1])); }, function($v) { (x = b.$capacity - 1 >> 0, (x < 0 || x >= this.$target.$length) ? $throwRuntimeError("index out of range") : this.$target.$array[this.$target.$offset + x] = $v); }, b);
		m.Mutex.Lock();
		$deferred.push([$methodVal(m, "Unlock"), []]);
		_key = p; (m.active || $throwRuntimeError("assignment to entry in nil map"))[_key.$key()] = { k: _key, v: b };
		_tmp$4 = b; _tmp$5 = null; data = _tmp$4; err = _tmp$5;
		return [data, err];
		/* */ } catch(err) { $err = err; } finally { $deferFrames.pop(); $callDeferred($deferred, $err); return [data, err]; }
	};
	mmapper.prototype.Mmap = function(fd, offset, length, prot, flags) { return this.$val.Mmap(fd, offset, length, prot, flags); };
	mmapper.Ptr.prototype.Munmap = function(data) {
		var err = null, $deferred = [], $err = null, m, x, x$1, p, _entry, b, errno;
		/* */ try { $deferFrames.push($deferred);
		m = this;
		if ((data.$length === 0) || !((data.$length === data.$capacity))) {
			err = new Errno(22);
			return err;
		}
		p = new ($ptrType($Uint8))(function() { return (x$1 = data.$capacity - 1 >> 0, ((x$1 < 0 || x$1 >= this.$target.$length) ? $throwRuntimeError("index out of range") : this.$target.$array[this.$target.$offset + x$1])); }, function($v) { (x = data.$capacity - 1 >> 0, (x < 0 || x >= this.$target.$length) ? $throwRuntimeError("index out of range") : this.$target.$array[this.$target.$offset + x] = $v); }, data);
		m.Mutex.Lock();
		$deferred.push([$methodVal(m, "Unlock"), []]);
		b = (_entry = m.active[p.$key()], _entry !== undefined ? _entry.v : ($sliceType($Uint8)).nil);
		if (b === ($sliceType($Uint8)).nil || !($sliceIsEqual(b, 0, data, 0))) {
			err = new Errno(22);
			return err;
		}
		errno = m.munmap($sliceToArray(b), (b.$length >>> 0));
		if (!($interfaceIsEqual(errno, null))) {
			err = errno;
			return err;
		}
		delete m.active[p.$key()];
		err = null;
		return err;
		/* */ } catch(err) { $err = err; } finally { $deferFrames.pop(); $callDeferred($deferred, $err); return err; }
	};
	mmapper.prototype.Munmap = function(data) { return this.$val.Munmap(data); };
	Errno.prototype.Error = function() {
		var e, s;
		e = this.$val !== undefined ? this.$val : this;
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
		e = this.$val !== undefined ? this.$val : this;
		return (e === 4) || (e === 24) || (new Errno(e)).Timeout();
	};
	$ptrType(Errno).prototype.Temporary = function() { return new Errno(this.$get()).Temporary(); };
	Errno.prototype.Timeout = function() {
		var e;
		e = this.$val !== undefined ? this.$val : this;
		return (e === 35) || (e === 35) || (e === 60);
	};
	$ptrType(Errno).prototype.Timeout = function() { return new Errno(this.$get()).Timeout(); };
	Read = $pkg.Read = function(fd, p) {
		var n = 0, err = null, _tuple;
		_tuple = read(fd, p); n = _tuple[0]; err = _tuple[1];
		return [n, err];
	};
	Write = $pkg.Write = function(fd, p) {
		var n = 0, err = null, _tuple;
		_tuple = write(fd, p); n = _tuple[0]; err = _tuple[1];
		return [n, err];
	};
	sysctl = function(mib, old, oldlen, new$1, newlen) {
		var err = null, _p0, _tuple, e1;
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
		var err = null, _tuple, e1;
		_tuple = Syscall(6, (fd >>> 0), 0, 0); e1 = _tuple[2];
		if (!((e1 === 0))) {
			err = new Errno(e1);
		}
		return err;
	};
	Fchdir = $pkg.Fchdir = function(fd) {
		var err = null, _tuple, e1;
		_tuple = Syscall(13, (fd >>> 0), 0, 0); e1 = _tuple[2];
		if (!((e1 === 0))) {
			err = new Errno(e1);
		}
		return err;
	};
	Fchmod = $pkg.Fchmod = function(fd, mode) {
		var err = null, _tuple, e1;
		_tuple = Syscall(124, (fd >>> 0), (mode >>> 0), 0); e1 = _tuple[2];
		if (!((e1 === 0))) {
			err = new Errno(e1);
		}
		return err;
	};
	Fchown = $pkg.Fchown = function(fd, uid, gid) {
		var err = null, _tuple, e1;
		_tuple = Syscall(123, (fd >>> 0), (uid >>> 0), (gid >>> 0)); e1 = _tuple[2];
		if (!((e1 === 0))) {
			err = new Errno(e1);
		}
		return err;
	};
	Fstat = $pkg.Fstat = function(fd, stat) {
		var err = null, _tuple, _array, _struct, _view, e1;
		_array = new Uint8Array(144);
		_tuple = Syscall(339, (fd >>> 0), _array, 0); e1 = _tuple[2];
		_struct = stat, _view = new DataView(_array.buffer, _array.byteOffset), _struct.Dev = _view.getInt32(0, true), _struct.Mode = _view.getUint16(4, true), _struct.Nlink = _view.getUint16(6, true), _struct.Ino = new $Uint64(_view.getUint32(12, true), _view.getUint32(8, true)), _struct.Uid = _view.getUint32(16, true), _struct.Gid = _view.getUint32(20, true), _struct.Rdev = _view.getInt32(24, true), _struct.Pad_cgo_0 = new ($nativeArray("Uint8"))(_array.buffer, $min(_array.byteOffset + 28, _array.buffer.byteLength)), _struct.Atimespec.Sec = new $Int64(_view.getUint32(36, true), _view.getUint32(32, true)), _struct.Atimespec.Nsec = new $Int64(_view.getUint32(44, true), _view.getUint32(40, true)), _struct.Mtimespec.Sec = new $Int64(_view.getUint32(52, true), _view.getUint32(48, true)), _struct.Mtimespec.Nsec = new $Int64(_view.getUint32(60, true), _view.getUint32(56, true)), _struct.Ctimespec.Sec = new $Int64(_view.getUint32(68, true), _view.getUint32(64, true)), _struct.Ctimespec.Nsec = new $Int64(_view.getUint32(76, true), _view.getUint32(72, true)), _struct.Birthtimespec.Sec = new $Int64(_view.getUint32(84, true), _view.getUint32(80, true)), _struct.Birthtimespec.Nsec = new $Int64(_view.getUint32(92, true), _view.getUint32(88, true)), _struct.Size = new $Int64(_view.getUint32(100, true), _view.getUint32(96, true)), _struct.Blocks = new $Int64(_view.getUint32(108, true), _view.getUint32(104, true)), _struct.Blksize = _view.getInt32(112, true), _struct.Flags = _view.getUint32(116, true), _struct.Gen = _view.getUint32(120, true), _struct.Lspare = _view.getInt32(124, true), _struct.Qspare = new ($nativeArray("Int64"))(_array.buffer, $min(_array.byteOffset + 128, _array.buffer.byteLength));
		if (!((e1 === 0))) {
			err = new Errno(e1);
		}
		return err;
	};
	Fsync = $pkg.Fsync = function(fd) {
		var err = null, _tuple, e1;
		_tuple = Syscall(95, (fd >>> 0), 0, 0); e1 = _tuple[2];
		if (!((e1 === 0))) {
			err = new Errno(e1);
		}
		return err;
	};
	Ftruncate = $pkg.Ftruncate = function(fd, length) {
		var err = null, _tuple, e1;
		_tuple = Syscall(201, (fd >>> 0), (length.$low >>> 0), 0); e1 = _tuple[2];
		if (!((e1 === 0))) {
			err = new Errno(e1);
		}
		return err;
	};
	Getdirentries = $pkg.Getdirentries = function(fd, buf, basep) {
		var n = 0, err = null, _p0, _tuple, r0, e1;
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
		var err = null, _p0, _tuple, _tuple$1, _array, _struct, _view, e1;
		_p0 = ($ptrType($Uint8)).nil;
		_tuple = BytePtrFromString(path); _p0 = _tuple[0]; err = _tuple[1];
		if (!($interfaceIsEqual(err, null))) {
			return err;
		}
		_array = new Uint8Array(144);
		_tuple$1 = Syscall(340, _p0, _array, 0); e1 = _tuple$1[2];
		_struct = stat, _view = new DataView(_array.buffer, _array.byteOffset), _struct.Dev = _view.getInt32(0, true), _struct.Mode = _view.getUint16(4, true), _struct.Nlink = _view.getUint16(6, true), _struct.Ino = new $Uint64(_view.getUint32(12, true), _view.getUint32(8, true)), _struct.Uid = _view.getUint32(16, true), _struct.Gid = _view.getUint32(20, true), _struct.Rdev = _view.getInt32(24, true), _struct.Pad_cgo_0 = new ($nativeArray("Uint8"))(_array.buffer, $min(_array.byteOffset + 28, _array.buffer.byteLength)), _struct.Atimespec.Sec = new $Int64(_view.getUint32(36, true), _view.getUint32(32, true)), _struct.Atimespec.Nsec = new $Int64(_view.getUint32(44, true), _view.getUint32(40, true)), _struct.Mtimespec.Sec = new $Int64(_view.getUint32(52, true), _view.getUint32(48, true)), _struct.Mtimespec.Nsec = new $Int64(_view.getUint32(60, true), _view.getUint32(56, true)), _struct.Ctimespec.Sec = new $Int64(_view.getUint32(68, true), _view.getUint32(64, true)), _struct.Ctimespec.Nsec = new $Int64(_view.getUint32(76, true), _view.getUint32(72, true)), _struct.Birthtimespec.Sec = new $Int64(_view.getUint32(84, true), _view.getUint32(80, true)), _struct.Birthtimespec.Nsec = new $Int64(_view.getUint32(92, true), _view.getUint32(88, true)), _struct.Size = new $Int64(_view.getUint32(100, true), _view.getUint32(96, true)), _struct.Blocks = new $Int64(_view.getUint32(108, true), _view.getUint32(104, true)), _struct.Blksize = _view.getInt32(112, true), _struct.Flags = _view.getUint32(116, true), _struct.Gen = _view.getUint32(120, true), _struct.Lspare = _view.getInt32(124, true), _struct.Qspare = new ($nativeArray("Int64"))(_array.buffer, $min(_array.byteOffset + 128, _array.buffer.byteLength));
		if (!((e1 === 0))) {
			err = new Errno(e1);
		}
		return err;
	};
	Pread = $pkg.Pread = function(fd, p, offset) {
		var n = 0, err = null, _p0, _tuple, r0, e1;
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
		var n = 0, err = null, _p0, _tuple, r0, e1;
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
		var n = 0, err = null, _p0, _tuple, r0, e1;
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
		var newoffset = new $Int64(0, 0), err = null, _tuple, r0, e1;
		_tuple = Syscall(199, (fd >>> 0), (offset.$low >>> 0), (whence >>> 0)); r0 = _tuple[0]; e1 = _tuple[2];
		newoffset = new $Int64(0, r0.constructor === Number ? r0 : 1);
		if (!((e1 === 0))) {
			err = new Errno(e1);
		}
		return [newoffset, err];
	};
	write = function(fd, p) {
		var n = 0, err = null, _p0, _tuple, r0, e1;
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
		var ret = 0, err = null, _tuple, r0, e1;
		_tuple = Syscall6(197, addr, length, (prot >>> 0), (flag >>> 0), (fd >>> 0), (pos.$low >>> 0)); r0 = _tuple[0]; e1 = _tuple[2];
		ret = r0;
		if (!((e1 === 0))) {
			err = new Errno(e1);
		}
		return [ret, err];
	};
	munmap = function(addr, length) {
		var err = null, _tuple, e1;
		_tuple = Syscall(73, addr, length, 0); e1 = _tuple[2];
		if (!((e1 === 0))) {
			err = new Errno(e1);
		}
		return err;
	};
	$pkg.$init = function() {
		($ptrType(mmapper)).methods = [["Lock", "Lock", "", [], [], false, 0], ["Mmap", "Mmap", "", [$Int, $Int64, $Int, $Int, $Int], [($sliceType($Uint8)), $error], false, -1], ["Munmap", "Munmap", "", [($sliceType($Uint8))], [$error], false, -1], ["Unlock", "Unlock", "", [], [], false, 0]];
		mmapper.init([["Mutex", "", "", sync.Mutex, ""], ["active", "active", "syscall", ($mapType(($ptrType($Uint8)), ($sliceType($Uint8)))), ""], ["mmap", "mmap", "syscall", ($funcType([$Uintptr, $Uintptr, $Int, $Int, $Int, $Int64], [$Uintptr, $error], false)), ""], ["munmap", "munmap", "syscall", ($funcType([$Uintptr, $Uintptr], [$error], false)), ""]]);
		Errno.methods = [["Error", "Error", "", [], [$String], false, -1], ["Temporary", "Temporary", "", [], [$Bool], false, -1], ["Timeout", "Timeout", "", [], [$Bool], false, -1]];
		($ptrType(Errno)).methods = [["Error", "Error", "", [], [$String], false, -1], ["Temporary", "Temporary", "", [], [$Bool], false, -1], ["Timeout", "Timeout", "", [], [$Bool], false, -1]];
		($ptrType(Timespec)).methods = [["Nano", "Nano", "", [], [$Int64], false, -1], ["Unix", "Unix", "", [], [$Int64, $Int64], false, -1]];
		Timespec.init([["Sec", "Sec", "", $Int64, ""], ["Nsec", "Nsec", "", $Int64, ""]]);
		Stat_t.init([["Dev", "Dev", "", $Int32, ""], ["Mode", "Mode", "", $Uint16, ""], ["Nlink", "Nlink", "", $Uint16, ""], ["Ino", "Ino", "", $Uint64, ""], ["Uid", "Uid", "", $Uint32, ""], ["Gid", "Gid", "", $Uint32, ""], ["Rdev", "Rdev", "", $Int32, ""], ["Pad_cgo_0", "Pad_cgo_0", "", ($arrayType($Uint8, 4)), ""], ["Atimespec", "Atimespec", "", Timespec, ""], ["Mtimespec", "Mtimespec", "", Timespec, ""], ["Ctimespec", "Ctimespec", "", Timespec, ""], ["Birthtimespec", "Birthtimespec", "", Timespec, ""], ["Size", "Size", "", $Int64, ""], ["Blocks", "Blocks", "", $Int64, ""], ["Blksize", "Blksize", "", $Int32, ""], ["Flags", "Flags", "", $Uint32, ""], ["Gen", "Gen", "", $Uint32, ""], ["Lspare", "Lspare", "", $Int32, ""], ["Qspare", "Qspare", "", ($arrayType($Int64, 2)), ""]]);
		Dirent.init([["Ino", "Ino", "", $Uint64, ""], ["Seekoff", "Seekoff", "", $Uint64, ""], ["Reclen", "Reclen", "", $Uint16, ""], ["Namlen", "Namlen", "", $Uint16, ""], ["Type", "Type", "", $Uint8, ""], ["Name", "Name", "", ($arrayType($Int8, 1024)), ""], ["Pad_cgo_0", "Pad_cgo_0", "", ($arrayType($Uint8, 3)), ""]]);
		lineBuffer = ($sliceType($Uint8)).nil;
		syscallModule = null;
		envOnce = new sync.Once.Ptr();
		envLock = new sync.RWMutex.Ptr();
		env = false;
		envs = ($sliceType($String)).nil;
		warningPrinted = false;
		alreadyTriedToLoad = false;
		minusOne = -1;
		$pkg.Stdin = 0;
		$pkg.Stdout = 1;
		$pkg.Stderr = 2;
		errors$1 = $toNativeArray("String", ["", "operation not permitted", "no such file or directory", "no such process", "interrupted system call", "input/output error", "device not configured", "argument list too long", "exec format error", "bad file descriptor", "no child processes", "resource deadlock avoided", "cannot allocate memory", "permission denied", "bad address", "block device required", "resource busy", "file exists", "cross-device link", "operation not supported by device", "not a directory", "is a directory", "invalid argument", "too many open files in system", "too many open files", "inappropriate ioctl for device", "text file busy", "file too large", "no space left on device", "illegal seek", "read-only file system", "too many links", "broken pipe", "numerical argument out of domain", "result too large", "resource temporarily unavailable", "operation now in progress", "operation already in progress", "socket operation on non-socket", "destination address required", "message too long", "protocol wrong type for socket", "protocol not available", "protocol not supported", "socket type not supported", "operation not supported", "protocol family not supported", "address family not supported by protocol family", "address already in use", "can't assign requested address", "network is down", "network is unreachable", "network dropped connection on reset", "software caused connection abort", "connection reset by peer", "no buffer space available", "socket is already connected", "socket is not connected", "can't send after socket shutdown", "too many references: can't splice", "operation timed out", "connection refused", "too many levels of symbolic links", "file name too long", "host is down", "no route to host", "directory not empty", "too many processes", "too many users", "disc quota exceeded", "stale NFS file handle", "too many levels of remote in path", "RPC struct is bad", "RPC version wrong", "RPC prog. not avail", "program version wrong", "bad procedure for program", "no locks available", "function not implemented", "inappropriate file type or format", "authentication error", "need authenticator", "device power is off", "device error", "value too large to be stored in data type", "bad executable (or shared library)", "bad CPU type in executable", "shared library version mismatch", "malformed Mach-o file", "operation canceled", "identifier removed", "no message of desired type", "illegal byte sequence", "attribute not found", "bad message", "EMULTIHOP (Reserved)", "no message available on STREAM", "ENOLINK (Reserved)", "no STREAM resources", "not a STREAM", "protocol error", "STREAM ioctl timeout", "operation not supported on socket", "policy not found", "state not recoverable", "previous owner died"]);
		mapper = new mmapper.Ptr(new sync.Mutex.Ptr(), new $Map(), mmap, munmap);
		init();
	};
	return $pkg;
})();
$packages["strings"] = (function() {
	var $pkg = {}, js = $packages["github.com/gopherjs/gopherjs/js"], errors = $packages["errors"], io = $packages["io"], utf8 = $packages["unicode/utf8"], unicode = $packages["unicode"], IndexByte;
	IndexByte = $pkg.IndexByte = function(s, c) {
		return $parseInt(s.indexOf($global.String.fromCharCode(c))) >> 0;
	};
	$pkg.$init = function() {
	};
	return $pkg;
})();
$packages["time"] = (function() {
	var $pkg = {}, js = $packages["github.com/gopherjs/gopherjs/js"], strings = $packages["strings"], errors = $packages["errors"], syscall = $packages["syscall"], sync = $packages["sync"], runtime = $packages["runtime"], ParseError, Time, Month, Weekday, Duration, Location, zone, zoneTrans, std0x, longDayNames, shortDayNames, shortMonthNames, longMonthNames, atoiError, errBad, errLeadingInt, months, days, daysBefore, utcLoc, localLoc, localOnce, zoneinfo, badData, zoneDirs, _tuple, initLocal, startsWithLowerCase, nextStdChunk, match, lookup, appendUint, atoi, formatNano, quote, isDigit, getnum, cutspace, skip, Parse, parse, parseTimeZone, parseGMT, parseNanoseconds, leadingInt, absWeekday, absClock, fmtFrac, fmtInt, absDate, Unix, isLeap, norm, Date, div, FixedZone;
	ParseError = $pkg.ParseError = $newType(0, "Struct", "time.ParseError", "ParseError", "time", function(Layout_, Value_, LayoutElem_, ValueElem_, Message_) {
		this.$val = this;
		this.Layout = Layout_ !== undefined ? Layout_ : "";
		this.Value = Value_ !== undefined ? Value_ : "";
		this.LayoutElem = LayoutElem_ !== undefined ? LayoutElem_ : "";
		this.ValueElem = ValueElem_ !== undefined ? ValueElem_ : "";
		this.Message = Message_ !== undefined ? Message_ : "";
	});
	Time = $pkg.Time = $newType(0, "Struct", "time.Time", "Time", "time", function(sec_, nsec_, loc_) {
		this.$val = this;
		this.sec = sec_ !== undefined ? sec_ : new $Int64(0, 0);
		this.nsec = nsec_ !== undefined ? nsec_ : 0;
		this.loc = loc_ !== undefined ? loc_ : ($ptrType(Location)).nil;
	});
	Month = $pkg.Month = $newType(4, "Int", "time.Month", "Month", "time", null);
	Weekday = $pkg.Weekday = $newType(4, "Int", "time.Weekday", "Weekday", "time", null);
	Duration = $pkg.Duration = $newType(8, "Int64", "time.Duration", "Duration", "time", null);
	Location = $pkg.Location = $newType(0, "Struct", "time.Location", "Location", "time", function(name_, zone_, tx_, cacheStart_, cacheEnd_, cacheZone_) {
		this.$val = this;
		this.name = name_ !== undefined ? name_ : "";
		this.zone = zone_ !== undefined ? zone_ : ($sliceType(zone)).nil;
		this.tx = tx_ !== undefined ? tx_ : ($sliceType(zoneTrans)).nil;
		this.cacheStart = cacheStart_ !== undefined ? cacheStart_ : new $Int64(0, 0);
		this.cacheEnd = cacheEnd_ !== undefined ? cacheEnd_ : new $Int64(0, 0);
		this.cacheZone = cacheZone_ !== undefined ? cacheZone_ : ($ptrType(zone)).nil;
	});
	zone = $pkg.zone = $newType(0, "Struct", "time.zone", "zone", "time", function(name_, offset_, isDST_) {
		this.$val = this;
		this.name = name_ !== undefined ? name_ : "";
		this.offset = offset_ !== undefined ? offset_ : 0;
		this.isDST = isDST_ !== undefined ? isDST_ : false;
	});
	zoneTrans = $pkg.zoneTrans = $newType(0, "Struct", "time.zoneTrans", "zoneTrans", "time", function(when_, index_, isstd_, isutc_) {
		this.$val = this;
		this.when = when_ !== undefined ? when_ : new $Int64(0, 0);
		this.index = index_ !== undefined ? index_ : 0;
		this.isstd = isstd_ !== undefined ? isstd_ : false;
		this.isutc = isutc_ !== undefined ? isutc_ : false;
	});
	initLocal = function() {
		var d, s, i, j, x;
		d = new ($global.Date)();
		s = $internalize(d, $String);
		i = strings.IndexByte(s, 40);
		j = strings.IndexByte(s, 41);
		if ((i === -1) || (j === -1)) {
			localLoc.name = "UTC";
			return;
		}
		localLoc.name = s.substring((i + 1 >> 0), j);
		localLoc.zone = new ($sliceType(zone))([new zone.Ptr(localLoc.name, (x = $parseInt(d.getTimezoneOffset()) >> 0, (((x >>> 16 << 16) * -60 >> 0) + (x << 16 >>> 16) * -60) >> 0), false)]);
	};
	startsWithLowerCase = function(str) {
		var c;
		if (str.length === 0) {
			return false;
		}
		c = str.charCodeAt(0);
		return 97 <= c && c <= 122;
	};
	nextStdChunk = function(layout) {
		var prefix = "", std = 0, suffix = "", i, c, _ref, _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, _tmp$6, _tmp$7, _tmp$8, _tmp$9, _tmp$10, _tmp$11, _tmp$12, _tmp$13, _tmp$14, _tmp$15, _tmp$16, x, _tmp$17, _tmp$18, _tmp$19, _tmp$20, _tmp$21, _tmp$22, _tmp$23, _tmp$24, _tmp$25, _tmp$26, _tmp$27, _tmp$28, _tmp$29, _tmp$30, _tmp$31, _tmp$32, _tmp$33, _tmp$34, _tmp$35, _tmp$36, _tmp$37, _tmp$38, _tmp$39, _tmp$40, _tmp$41, _tmp$42, _tmp$43, _tmp$44, _tmp$45, _tmp$46, _tmp$47, _tmp$48, _tmp$49, _tmp$50, _tmp$51, _tmp$52, _tmp$53, _tmp$54, _tmp$55, _tmp$56, _tmp$57, _tmp$58, _tmp$59, _tmp$60, _tmp$61, _tmp$62, _tmp$63, _tmp$64, _tmp$65, _tmp$66, _tmp$67, _tmp$68, _tmp$69, _tmp$70, _tmp$71, _tmp$72, _tmp$73, _tmp$74, ch, j, std$1, _tmp$75, _tmp$76, _tmp$77, _tmp$78, _tmp$79, _tmp$80;
		i = 0;
		while (i < layout.length) {
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
					while (j < layout.length && (layout.charCodeAt(j) === ch)) {
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
		var i, c1, c2;
		i = 0;
		while (i < s1.length) {
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
		var _ref, _i, i, v;
		_ref = tab;
		_i = 0;
		while (_i < _ref.$length) {
			i = _i;
			v = ((_i < 0 || _i >= _ref.$length) ? $throwRuntimeError("index out of range") : _ref.$array[_ref.$offset + _i]);
			if (val.length >= v.length && match(val.substring(0, v.length), v)) {
				return [i, val.substring(v.length), null];
			}
			_i++;
		}
		return [-1, val, errBad];
	};
	appendUint = function(b, x, pad) {
		var _q, _r, buf, n, _r$1, _q$1;
		if (x < 10) {
			if (!((pad === 0))) {
				b = $append(b, pad);
			}
			return $append(b, ((48 + x >>> 0) << 24 >>> 24));
		}
		if (x < 100) {
			b = $append(b, ((48 + (_q = x / 10, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >>> 0 : $throwRuntimeError("integer divide by zero")) >>> 0) << 24 >>> 24));
			b = $append(b, ((48 + (_r = x % 10, _r === _r ? _r : $throwRuntimeError("integer divide by zero")) >>> 0) << 24 >>> 24));
			return b;
		}
		buf = ($arrayType($Uint8, 32)).zero(); $copy(buf, ($arrayType($Uint8, 32)).zero(), ($arrayType($Uint8, 32)));
		n = 32;
		if (x === 0) {
			return $append(b, 48);
		}
		while (x >= 10) {
			n = n - (1) >> 0;
			(n < 0 || n >= buf.length) ? $throwRuntimeError("index out of range") : buf[n] = (((_r$1 = x % 10, _r$1 === _r$1 ? _r$1 : $throwRuntimeError("integer divide by zero")) + 48 >>> 0) << 24 >>> 24);
			x = (_q$1 = x / (10), (_q$1 === _q$1 && _q$1 !== 1/0 && _q$1 !== -1/0) ? _q$1 >>> 0 : $throwRuntimeError("integer divide by zero"));
		}
		n = n - (1) >> 0;
		(n < 0 || n >= buf.length) ? $throwRuntimeError("index out of range") : buf[n] = ((x + 48 >>> 0) << 24 >>> 24);
		return $appendSlice(b, $subslice(new ($sliceType($Uint8))(buf), n));
	};
	atoi = function(s) {
		var x = 0, err = null, neg, _tuple$1, q, rem, _tmp, _tmp$1, _tmp$2, _tmp$3;
		neg = false;
		if (!(s === "") && ((s.charCodeAt(0) === 45) || (s.charCodeAt(0) === 43))) {
			neg = s.charCodeAt(0) === 45;
			s = s.substring(1);
		}
		_tuple$1 = leadingInt(s); q = _tuple$1[0]; rem = _tuple$1[1]; err = _tuple$1[2];
		x = ((q.$low + ((q.$high >> 31) * 4294967296)) >> 0);
		if (!($interfaceIsEqual(err, null)) || !(rem === "")) {
			_tmp = 0; _tmp$1 = atoiError; x = _tmp; err = _tmp$1;
			return [x, err];
		}
		if (neg) {
			x = -x;
		}
		_tmp$2 = x; _tmp$3 = null; x = _tmp$2; err = _tmp$3;
		return [x, err];
	};
	formatNano = function(b, nanosec, n, trim) {
		var u, buf, start, _r, _q, x;
		u = nanosec;
		buf = ($arrayType($Uint8, 9)).zero(); $copy(buf, ($arrayType($Uint8, 9)).zero(), ($arrayType($Uint8, 9)));
		start = 9;
		while (start > 0) {
			start = start - (1) >> 0;
			(start < 0 || start >= buf.length) ? $throwRuntimeError("index out of range") : buf[start] = (((_r = u % 10, _r === _r ? _r : $throwRuntimeError("integer divide by zero")) + 48 >>> 0) << 24 >>> 24);
			u = (_q = u / (10), (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >>> 0 : $throwRuntimeError("integer divide by zero"));
		}
		if (n > 9) {
			n = 9;
		}
		if (trim) {
			while (n > 0 && ((x = n - 1 >> 0, ((x < 0 || x >= buf.length) ? $throwRuntimeError("index out of range") : buf[x])) === 48)) {
				n = n - (1) >> 0;
			}
			if (n === 0) {
				return b;
			}
		}
		b = $append(b, 46);
		return $appendSlice(b, $subslice(new ($sliceType($Uint8))(buf), 0, n));
	};
	Time.Ptr.prototype.String = function() {
		var t;
		t = new Time.Ptr(); $copy(t, this, Time);
		return t.Format("2006-01-02 15:04:05.999999999 -0700 MST");
	};
	Time.prototype.String = function() { return this.$val.String(); };
	Time.Ptr.prototype.Format = function(layout) {
		var t, _tuple$1, name, offset, abs, year, month, day, hour, min, sec, b, buf, max, _tuple$2, prefix, std, suffix, _tuple$3, _tuple$4, _ref, y, _r, y$1, m, s, _r$1, hr, _r$2, hr$1, _q, zone$1, absoffset, _q$1, _r$3, _r$4, _q$2, zone$2, _q$3, _r$5;
		t = new Time.Ptr(); $copy(t, this, Time);
		_tuple$1 = t.locabs(); name = _tuple$1[0]; offset = _tuple$1[1]; abs = _tuple$1[2];
		year = -1;
		month = 0;
		day = 0;
		hour = -1;
		min = 0;
		sec = 0;
		b = ($sliceType($Uint8)).nil;
		buf = ($arrayType($Uint8, 64)).zero(); $copy(buf, ($arrayType($Uint8, 64)).zero(), ($arrayType($Uint8, 64)));
		max = layout.length + 10 >> 0;
		if (max <= 64) {
			b = $subslice(new ($sliceType($Uint8))(buf), 0, 0);
		} else {
			b = ($sliceType($Uint8)).make(0, max);
		}
		while (!(layout === "")) {
			_tuple$2 = nextStdChunk(layout); prefix = _tuple$2[0]; std = _tuple$2[1]; suffix = _tuple$2[2];
			if (!(prefix === "")) {
				b = $appendSlice(b, new ($sliceType($Uint8))($stringToBytes(prefix)));
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
				b = appendUint(b, ((_r = y % 100, _r === _r ? _r : $throwRuntimeError("integer divide by zero")) >>> 0), 48);
			} else if (_ref === 273) {
				y$1 = year;
				if (year <= -1000) {
					b = $append(b, 45);
					y$1 = -y$1;
				} else if (year <= -100) {
					b = $appendSlice(b, new ($sliceType($Uint8))($stringToBytes("-0")));
					y$1 = -y$1;
				} else if (year <= -10) {
					b = $appendSlice(b, new ($sliceType($Uint8))($stringToBytes("-00")));
					y$1 = -y$1;
				} else if (year < 0) {
					b = $appendSlice(b, new ($sliceType($Uint8))($stringToBytes("-000")));
					y$1 = -y$1;
				} else if (year < 10) {
					b = $appendSlice(b, new ($sliceType($Uint8))($stringToBytes("000")));
				} else if (year < 100) {
					b = $appendSlice(b, new ($sliceType($Uint8))($stringToBytes("00")));
				} else if (year < 1000) {
					b = $append(b, 48);
				}
				b = appendUint(b, (y$1 >>> 0), 0);
			} else if (_ref === 258) {
				b = $appendSlice(b, new ($sliceType($Uint8))($stringToBytes((new Month(month)).String().substring(0, 3))));
			} else if (_ref === 257) {
				m = (new Month(month)).String();
				b = $appendSlice(b, new ($sliceType($Uint8))($stringToBytes(m)));
			} else if (_ref === 259) {
				b = appendUint(b, (month >>> 0), 0);
			} else if (_ref === 260) {
				b = appendUint(b, (month >>> 0), 48);
			} else if (_ref === 262) {
				b = $appendSlice(b, new ($sliceType($Uint8))($stringToBytes((new Weekday(absWeekday(abs))).String().substring(0, 3))));
			} else if (_ref === 261) {
				s = (new Weekday(absWeekday(abs))).String();
				b = $appendSlice(b, new ($sliceType($Uint8))($stringToBytes(s)));
			} else if (_ref === 263) {
				b = appendUint(b, (day >>> 0), 0);
			} else if (_ref === 264) {
				b = appendUint(b, (day >>> 0), 32);
			} else if (_ref === 265) {
				b = appendUint(b, (day >>> 0), 48);
			} else if (_ref === 522) {
				b = appendUint(b, (hour >>> 0), 48);
			} else if (_ref === 523) {
				hr = (_r$1 = hour % 12, _r$1 === _r$1 ? _r$1 : $throwRuntimeError("integer divide by zero"));
				if (hr === 0) {
					hr = 12;
				}
				b = appendUint(b, (hr >>> 0), 0);
			} else if (_ref === 524) {
				hr$1 = (_r$2 = hour % 12, _r$2 === _r$2 ? _r$2 : $throwRuntimeError("integer divide by zero"));
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
					b = $appendSlice(b, new ($sliceType($Uint8))($stringToBytes("PM")));
				} else {
					b = $appendSlice(b, new ($sliceType($Uint8))($stringToBytes("AM")));
				}
			} else if (_ref === 532) {
				if (hour >= 12) {
					b = $appendSlice(b, new ($sliceType($Uint8))($stringToBytes("pm")));
				} else {
					b = $appendSlice(b, new ($sliceType($Uint8))($stringToBytes("am")));
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
				if ((std === 24) || (std === 29)) {
					b = $append(b, 58);
				}
				b = appendUint(b, ((_r$3 = zone$1 % 60, _r$3 === _r$3 ? _r$3 : $throwRuntimeError("integer divide by zero")) >>> 0), 48);
				if ((std === 23) || (std === 27) || (std === 30) || (std === 25)) {
					if ((std === 30) || (std === 25)) {
						b = $append(b, 58);
					}
					b = appendUint(b, ((_r$4 = absoffset % 60, _r$4 === _r$4 ? _r$4 : $throwRuntimeError("integer divide by zero")) >>> 0), 48);
				}
			} else if (_ref === 21) {
				if (!(name === "")) {
					b = $appendSlice(b, new ($sliceType($Uint8))($stringToBytes(name)));
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
				b = appendUint(b, ((_r$5 = zone$2 % 60, _r$5 === _r$5 ? _r$5 : $throwRuntimeError("integer divide by zero")) >>> 0), 48);
			} else if (_ref === 31 || _ref === 32) {
				b = formatNano(b, (t.Nanosecond() >>> 0), std >> 16 >> 0, (std & 65535) === 32);
			} }
		}
		return $bytesToString(b);
	};
	Time.prototype.Format = function(layout) { return this.$val.Format(layout); };
	quote = function(s) {
		return "\"" + s + "\"";
	};
	ParseError.Ptr.prototype.Error = function() {
		var e;
		e = this;
		if (e.Message === "") {
			return "parsing time " + quote(e.Value) + " as " + quote(e.Layout) + ": cannot parse " + quote(e.ValueElem) + " as " + quote(e.LayoutElem);
		}
		return "parsing time " + quote(e.Value) + e.Message;
	};
	ParseError.prototype.Error = function() { return this.$val.Error(); };
	isDigit = function(s, i) {
		var c;
		if (s.length <= i) {
			return false;
		}
		c = s.charCodeAt(i);
		return 48 <= c && c <= 57;
	};
	getnum = function(s, fixed) {
		var x;
		if (!isDigit(s, 0)) {
			return [0, s, errBad];
		}
		if (!isDigit(s, 1)) {
			if (fixed) {
				return [0, s, errBad];
			}
			return [((s.charCodeAt(0) - 48 << 24 >>> 24) >> 0), s.substring(1), null];
		}
		return [(x = ((s.charCodeAt(0) - 48 << 24 >>> 24) >> 0), (((x >>> 16 << 16) * 10 >> 0) + (x << 16 >>> 16) * 10) >> 0) + ((s.charCodeAt(1) - 48 << 24 >>> 24) >> 0) >> 0, s.substring(2), null];
	};
	cutspace = function(s) {
		while (s.length > 0 && (s.charCodeAt(0) === 32)) {
			s = s.substring(1);
		}
		return s;
	};
	skip = function(value, prefix) {
		while (prefix.length > 0) {
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
		return [value, null];
	};
	Parse = $pkg.Parse = function(layout, value) {
		return parse(layout, value, $pkg.UTC, $pkg.Local);
	};
	parse = function(layout, value, defaultLocation, local) {
		var _tmp, _tmp$1, alayout, avalue, rangeErrString, amSet, pmSet, year, month, day, hour, min, sec, nsec, z, zoneOffset, zoneName, err, _tuple$1, prefix, std, suffix, stdstr, _tuple$2, p, _ref, _tmp$2, _tmp$3, _tuple$3, _tmp$4, _tmp$5, _tuple$4, _tuple$5, _tuple$6, _tuple$7, _tuple$8, _tuple$9, _tuple$10, _tuple$11, _tuple$12, _tuple$13, _tuple$14, _tuple$15, n, _tuple$16, _tmp$6, _tmp$7, _ref$1, _tmp$8, _tmp$9, _ref$2, _tmp$10, _tmp$11, _tmp$12, _tmp$13, sign, hour$1, min$1, seconds, _tmp$14, _tmp$15, _tmp$16, _tmp$17, _tmp$18, _tmp$19, _tmp$20, _tmp$21, _tmp$22, _tmp$23, _tmp$24, _tmp$25, _tmp$26, _tmp$27, _tmp$28, _tmp$29, _tmp$30, _tmp$31, _tmp$32, _tmp$33, _tmp$34, _tmp$35, _tmp$36, _tmp$37, _tmp$38, _tmp$39, _tmp$40, _tmp$41, hr, mm, ss, _tuple$17, _tuple$18, _tuple$19, x, _ref$3, _tuple$20, n$1, ok, _tmp$42, _tmp$43, ndigit, _tuple$21, i, _tuple$22, t, x$1, x$2, _tuple$23, x$3, name, offset, t$1, _tuple$24, x$4, offset$1, ok$1, x$5, x$6, _tuple$25, x$7;
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
		z = ($ptrType(Location)).nil;
		zoneOffset = -1;
		zoneName = "";
		while (true) {
			err = null;
			_tuple$1 = nextStdChunk(layout); prefix = _tuple$1[0]; std = _tuple$1[1]; suffix = _tuple$1[2];
			stdstr = layout.substring(prefix.length, (layout.length - suffix.length >> 0));
			_tuple$2 = skip(value, prefix); value = _tuple$2[0]; err = _tuple$2[1];
			if (!($interfaceIsEqual(err, null))) {
				return [new Time.Ptr(new $Int64(0, 0), 0, ($ptrType(Location)).nil), new ParseError.Ptr(alayout, avalue, prefix, value, "")];
			}
			if (std === 0) {
				if (!((value.length === 0))) {
					return [new Time.Ptr(new $Int64(0, 0), 0, ($ptrType(Location)).nil), new ParseError.Ptr(alayout, avalue, "", value, ": extra text: " + value)];
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
					while (n < value.length && isDigit(value, n)) {
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
				if ($interfaceIsEqual(err, null)) {
					_tuple$18 = atoi(min$1); mm = _tuple$18[0]; err = _tuple$18[1];
				}
				if ($interfaceIsEqual(err, null)) {
					_tuple$19 = atoi(seconds); ss = _tuple$19[0]; err = _tuple$19[1];
				}
				zoneOffset = (x = (((((hr >>> 16 << 16) * 60 >> 0) + (hr << 16 >>> 16) * 60) >> 0) + mm >> 0), (((x >>> 16 << 16) * 60 >> 0) + (x << 16 >>> 16) * 60) >> 0) + ss >> 0;
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
				while (i < 9 && (i + 1 >> 0) < value.length && 48 <= value.charCodeAt((i + 1 >> 0)) && value.charCodeAt((i + 1 >> 0)) <= 57) {
					i = i + (1) >> 0;
				}
				_tuple$22 = parseNanoseconds(value, 1 + i >> 0); nsec = _tuple$22[0]; rangeErrString = _tuple$22[1]; err = _tuple$22[2];
				value = value.substring((1 + i >> 0));
			} }
			if (!(rangeErrString === "")) {
				return [new Time.Ptr(new $Int64(0, 0), 0, ($ptrType(Location)).nil), new ParseError.Ptr(alayout, avalue, stdstr, value, ": " + rangeErrString + " out of range")];
			}
			if (!($interfaceIsEqual(err, null))) {
				return [new Time.Ptr(new $Int64(0, 0), 0, ($ptrType(Location)).nil), new ParseError.Ptr(alayout, avalue, stdstr, value, "")];
			}
		}
		if (pmSet && hour < 12) {
			hour = hour + (12) >> 0;
		} else if (amSet && (hour === 12)) {
			hour = 0;
		}
		if (!(z === ($ptrType(Location)).nil)) {
			return [Date(year, (month >> 0), day, hour, min, sec, nsec, z), null];
		}
		if (!((zoneOffset === -1))) {
			t = new Time.Ptr(); $copy(t, Date(year, (month >> 0), day, hour, min, sec, nsec, $pkg.UTC), Time);
			t.sec = (x$1 = t.sec, x$2 = new $Int64(0, zoneOffset), new $Int64(x$1.$high - x$2.$high, x$1.$low - x$2.$low));
			_tuple$23 = local.lookup((x$3 = t.sec, new $Int64(x$3.$high + -15, x$3.$low + 2288912640))); name = _tuple$23[0]; offset = _tuple$23[1];
			if ((offset === zoneOffset) && (zoneName === "" || name === zoneName)) {
				t.loc = local;
				return [t, null];
			}
			t.loc = FixedZone(zoneName, zoneOffset);
			return [t, null];
		}
		if (!(zoneName === "")) {
			t$1 = new Time.Ptr(); $copy(t$1, Date(year, (month >> 0), day, hour, min, sec, nsec, $pkg.UTC), Time);
			_tuple$24 = local.lookupName(zoneName, (x$4 = t$1.sec, new $Int64(x$4.$high + -15, x$4.$low + 2288912640))); offset$1 = _tuple$24[0]; ok$1 = _tuple$24[2];
			if (ok$1) {
				t$1.sec = (x$5 = t$1.sec, x$6 = new $Int64(0, offset$1), new $Int64(x$5.$high - x$6.$high, x$5.$low - x$6.$low));
				t$1.loc = local;
				return [t$1, null];
			}
			if (zoneName.length > 3 && zoneName.substring(0, 3) === "GMT") {
				_tuple$25 = atoi(zoneName.substring(3)); offset$1 = _tuple$25[0];
				offset$1 = (x$7 = 3600, (((offset$1 >>> 16 << 16) * x$7 >> 0) + (offset$1 << 16 >>> 16) * x$7) >> 0);
			}
			t$1.loc = FixedZone(zoneName, offset$1);
			return [t$1, null];
		}
		return [Date(year, (month >> 0), day, hour, min, sec, nsec, defaultLocation), null];
	};
	parseTimeZone = function(value) {
		var length = 0, ok = false, _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, nUpper, c, _ref, _tmp$6, _tmp$7, _tmp$8, _tmp$9, _tmp$10, _tmp$11, _tmp$12, _tmp$13, _tmp$14, _tmp$15;
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
		while (nUpper < 6) {
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
		var sign, _tuple$1, x, rem, err;
		value = value.substring(3);
		if (value.length === 0) {
			return 3;
		}
		sign = value.charCodeAt(0);
		if (!((sign === 45)) && !((sign === 43))) {
			return 3;
		}
		_tuple$1 = leadingInt(value.substring(1)); x = _tuple$1[0]; rem = _tuple$1[1]; err = _tuple$1[2];
		if (!($interfaceIsEqual(err, null))) {
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
		var ns = 0, rangeErrString = "", err = null, _tuple$1, scaleDigits, i, x;
		if (!((value.charCodeAt(0) === 46))) {
			err = errBad;
			return [ns, rangeErrString, err];
		}
		_tuple$1 = atoi(value.substring(1, nbytes)); ns = _tuple$1[0]; err = _tuple$1[1];
		if (!($interfaceIsEqual(err, null))) {
			return [ns, rangeErrString, err];
		}
		if (ns < 0 || 1000000000 <= ns) {
			rangeErrString = "fractional second";
			return [ns, rangeErrString, err];
		}
		scaleDigits = 10 - nbytes >> 0;
		i = 0;
		while (i < scaleDigits) {
			ns = (x = 10, (((ns >>> 16 << 16) * x >> 0) + (ns << 16 >>> 16) * x) >> 0);
			i = i + (1) >> 0;
		}
		return [ns, rangeErrString, err];
	};
	leadingInt = function(s) {
		var x = new $Int64(0, 0), rem = "", err = null, i, c, _tmp, _tmp$1, _tmp$2, x$1, x$2, x$3, _tmp$3, _tmp$4, _tmp$5;
		i = 0;
		while (i < s.length) {
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
		_tmp$3 = x; _tmp$4 = s.substring(i); _tmp$5 = null; x = _tmp$3; rem = _tmp$4; err = _tmp$5;
		return [x, rem, err];
	};
	Time.Ptr.prototype.After = function(u) {
		var t, x, x$1, x$2, x$3;
		t = new Time.Ptr(); $copy(t, this, Time);
		return (x = t.sec, x$1 = u.sec, (x.$high > x$1.$high || (x.$high === x$1.$high && x.$low > x$1.$low))) || (x$2 = t.sec, x$3 = u.sec, (x$2.$high === x$3.$high && x$2.$low === x$3.$low)) && t.nsec > u.nsec;
	};
	Time.prototype.After = function(u) { return this.$val.After(u); };
	Time.Ptr.prototype.Before = function(u) {
		var t, x, x$1, x$2, x$3;
		t = new Time.Ptr(); $copy(t, this, Time);
		return (x = t.sec, x$1 = u.sec, (x.$high < x$1.$high || (x.$high === x$1.$high && x.$low < x$1.$low))) || (x$2 = t.sec, x$3 = u.sec, (x$2.$high === x$3.$high && x$2.$low === x$3.$low)) && t.nsec < u.nsec;
	};
	Time.prototype.Before = function(u) { return this.$val.Before(u); };
	Time.Ptr.prototype.Equal = function(u) {
		var t, x, x$1;
		t = new Time.Ptr(); $copy(t, this, Time);
		return (x = t.sec, x$1 = u.sec, (x.$high === x$1.$high && x.$low === x$1.$low)) && (t.nsec === u.nsec);
	};
	Time.prototype.Equal = function(u) { return this.$val.Equal(u); };
	Month.prototype.String = function() {
		var m, x;
		m = this.$val !== undefined ? this.$val : this;
		return (x = m - 1 >> 0, ((x < 0 || x >= months.length) ? $throwRuntimeError("index out of range") : months[x]));
	};
	$ptrType(Month).prototype.String = function() { return new Month(this.$get()).String(); };
	Weekday.prototype.String = function() {
		var d;
		d = this.$val !== undefined ? this.$val : this;
		return ((d < 0 || d >= days.length) ? $throwRuntimeError("index out of range") : days[d]);
	};
	$ptrType(Weekday).prototype.String = function() { return new Weekday(this.$get()).String(); };
	Time.Ptr.prototype.IsZero = function() {
		var t, x;
		t = new Time.Ptr(); $copy(t, this, Time);
		return (x = t.sec, (x.$high === 0 && x.$low === 0)) && (t.nsec === 0);
	};
	Time.prototype.IsZero = function() { return this.$val.IsZero(); };
	Time.Ptr.prototype.abs = function() {
		var t, l, x, sec, x$1, x$2, x$3, _tuple$1, offset, x$4, x$5;
		t = new Time.Ptr(); $copy(t, this, Time);
		l = t.loc;
		if (l === ($ptrType(Location)).nil || l === localLoc) {
			l = l.get();
		}
		sec = (x = t.sec, new $Int64(x.$high + -15, x.$low + 2288912640));
		if (!(l === utcLoc)) {
			if (!(l.cacheZone === ($ptrType(zone)).nil) && (x$1 = l.cacheStart, (x$1.$high < sec.$high || (x$1.$high === sec.$high && x$1.$low <= sec.$low))) && (x$2 = l.cacheEnd, (sec.$high < x$2.$high || (sec.$high === x$2.$high && sec.$low < x$2.$low)))) {
				sec = (x$3 = new $Int64(0, l.cacheZone.offset), new $Int64(sec.$high + x$3.$high, sec.$low + x$3.$low));
			} else {
				_tuple$1 = l.lookup(sec); offset = _tuple$1[1];
				sec = (x$4 = new $Int64(0, offset), new $Int64(sec.$high + x$4.$high, sec.$low + x$4.$low));
			}
		}
		return (x$5 = new $Int64(sec.$high + 2147483646, sec.$low + 450480384), new $Uint64(x$5.$high, x$5.$low));
	};
	Time.prototype.abs = function() { return this.$val.abs(); };
	Time.Ptr.prototype.locabs = function() {
		var name = "", offset = 0, abs = new $Uint64(0, 0), t, l, x, sec, x$1, x$2, _tuple$1, x$3, x$4;
		t = new Time.Ptr(); $copy(t, this, Time);
		l = t.loc;
		if (l === ($ptrType(Location)).nil || l === localLoc) {
			l = l.get();
		}
		sec = (x = t.sec, new $Int64(x.$high + -15, x.$low + 2288912640));
		if (!(l === utcLoc)) {
			if (!(l.cacheZone === ($ptrType(zone)).nil) && (x$1 = l.cacheStart, (x$1.$high < sec.$high || (x$1.$high === sec.$high && x$1.$low <= sec.$low))) && (x$2 = l.cacheEnd, (sec.$high < x$2.$high || (sec.$high === x$2.$high && sec.$low < x$2.$low)))) {
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
	Time.Ptr.prototype.Date = function() {
		var year = 0, month = 0, day = 0, t, _tuple$1;
		t = new Time.Ptr(); $copy(t, this, Time);
		_tuple$1 = t.date(true); year = _tuple$1[0]; month = _tuple$1[1]; day = _tuple$1[2];
		return [year, month, day];
	};
	Time.prototype.Date = function() { return this.$val.Date(); };
	Time.Ptr.prototype.Year = function() {
		var t, _tuple$1, year;
		t = new Time.Ptr(); $copy(t, this, Time);
		_tuple$1 = t.date(false); year = _tuple$1[0];
		return year;
	};
	Time.prototype.Year = function() { return this.$val.Year(); };
	Time.Ptr.prototype.Month = function() {
		var t, _tuple$1, month;
		t = new Time.Ptr(); $copy(t, this, Time);
		_tuple$1 = t.date(true); month = _tuple$1[1];
		return month;
	};
	Time.prototype.Month = function() { return this.$val.Month(); };
	Time.Ptr.prototype.Day = function() {
		var t, _tuple$1, day;
		t = new Time.Ptr(); $copy(t, this, Time);
		_tuple$1 = t.date(true); day = _tuple$1[2];
		return day;
	};
	Time.prototype.Day = function() { return this.$val.Day(); };
	Time.Ptr.prototype.Weekday = function() {
		var t;
		t = new Time.Ptr(); $copy(t, this, Time);
		return absWeekday(t.abs());
	};
	Time.prototype.Weekday = function() { return this.$val.Weekday(); };
	absWeekday = function(abs) {
		var sec, _q;
		sec = $div64((new $Uint64(abs.$high + 0, abs.$low + 86400)), new $Uint64(0, 604800), true);
		return ((_q = (sec.$low >> 0) / 86400, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero")) >> 0);
	};
	Time.Ptr.prototype.ISOWeek = function() {
		var year = 0, week = 0, t, _tuple$1, month, day, yday, _r, wday, _q, _r$1, jan1wday, _r$2, dec31wday;
		t = new Time.Ptr(); $copy(t, this, Time);
		_tuple$1 = t.date(true); year = _tuple$1[0]; month = _tuple$1[1]; day = _tuple$1[2]; yday = _tuple$1[3];
		wday = (_r = ((t.Weekday() + 6 >> 0) >> 0) % 7, _r === _r ? _r : $throwRuntimeError("integer divide by zero"));
		week = (_q = (((yday - wday >> 0) + 7 >> 0)) / 7, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero"));
		jan1wday = (_r$1 = (((wday - yday >> 0) + 371 >> 0)) % 7, _r$1 === _r$1 ? _r$1 : $throwRuntimeError("integer divide by zero"));
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
			dec31wday = (_r$2 = (((wday + 31 >> 0) - day >> 0)) % 7, _r$2 === _r$2 ? _r$2 : $throwRuntimeError("integer divide by zero"));
			if (0 <= dec31wday && dec31wday <= 2) {
				year = year + (1) >> 0;
				week = 1;
			}
		}
		return [year, week];
	};
	Time.prototype.ISOWeek = function() { return this.$val.ISOWeek(); };
	Time.Ptr.prototype.Clock = function() {
		var hour = 0, min = 0, sec = 0, t, _tuple$1;
		t = new Time.Ptr(); $copy(t, this, Time);
		_tuple$1 = absClock(t.abs()); hour = _tuple$1[0]; min = _tuple$1[1]; sec = _tuple$1[2];
		return [hour, min, sec];
	};
	Time.prototype.Clock = function() { return this.$val.Clock(); };
	absClock = function(abs) {
		var hour = 0, min = 0, sec = 0, _q, _q$1;
		sec = ($div64(abs, new $Uint64(0, 86400), true).$low >> 0);
		hour = (_q = sec / 3600, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero"));
		sec = sec - (((((hour >>> 16 << 16) * 3600 >> 0) + (hour << 16 >>> 16) * 3600) >> 0)) >> 0;
		min = (_q$1 = sec / 60, (_q$1 === _q$1 && _q$1 !== 1/0 && _q$1 !== -1/0) ? _q$1 >> 0 : $throwRuntimeError("integer divide by zero"));
		sec = sec - (((((min >>> 16 << 16) * 60 >> 0) + (min << 16 >>> 16) * 60) >> 0)) >> 0;
		return [hour, min, sec];
	};
	Time.Ptr.prototype.Hour = function() {
		var t, _q;
		t = new Time.Ptr(); $copy(t, this, Time);
		return (_q = ($div64(t.abs(), new $Uint64(0, 86400), true).$low >> 0) / 3600, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero"));
	};
	Time.prototype.Hour = function() { return this.$val.Hour(); };
	Time.Ptr.prototype.Minute = function() {
		var t, _q;
		t = new Time.Ptr(); $copy(t, this, Time);
		return (_q = ($div64(t.abs(), new $Uint64(0, 3600), true).$low >> 0) / 60, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero"));
	};
	Time.prototype.Minute = function() { return this.$val.Minute(); };
	Time.Ptr.prototype.Second = function() {
		var t;
		t = new Time.Ptr(); $copy(t, this, Time);
		return ($div64(t.abs(), new $Uint64(0, 60), true).$low >> 0);
	};
	Time.prototype.Second = function() { return this.$val.Second(); };
	Time.Ptr.prototype.Nanosecond = function() {
		var t;
		t = new Time.Ptr(); $copy(t, this, Time);
		return (t.nsec >> 0);
	};
	Time.prototype.Nanosecond = function() { return this.$val.Nanosecond(); };
	Time.Ptr.prototype.YearDay = function() {
		var t, _tuple$1, yday;
		t = new Time.Ptr(); $copy(t, this, Time);
		_tuple$1 = t.date(false); yday = _tuple$1[3];
		return yday + 1 >> 0;
	};
	Time.prototype.YearDay = function() { return this.$val.YearDay(); };
	Duration.prototype.String = function() {
		var d, buf, w, u, neg, prec, unit, x, _tuple$1, _tuple$2;
		d = this;
		buf = ($arrayType($Uint8, 32)).zero(); $copy(buf, ($arrayType($Uint8, 32)).zero(), ($arrayType($Uint8, 32)));
		w = 32;
		u = new $Uint64(d.$high, d.$low);
		neg = (d.$high < 0 || (d.$high === 0 && d.$low < 0));
		if (neg) {
			u = new $Uint64(-u.$high, -u.$low);
		}
		if ((u.$high < 0 || (u.$high === 0 && u.$low < 1000000000))) {
			prec = 0;
			unit = 0;
			if ((u.$high === 0 && u.$low === 0)) {
				return "0";
			} else if ((u.$high < 0 || (u.$high === 0 && u.$low < 1000))) {
				prec = 0;
				unit = 110;
			} else if ((u.$high < 0 || (u.$high === 0 && u.$low < 1000000))) {
				prec = 3;
				unit = 117;
			} else {
				prec = 6;
				unit = 109;
			}
			w = w - (2) >> 0;
			(w < 0 || w >= buf.length) ? $throwRuntimeError("index out of range") : buf[w] = unit;
			(x = w + 1 >> 0, (x < 0 || x >= buf.length) ? $throwRuntimeError("index out of range") : buf[x] = 115);
			_tuple$1 = fmtFrac($subslice(new ($sliceType($Uint8))(buf), 0, w), u, prec); w = _tuple$1[0]; u = _tuple$1[1];
			w = fmtInt($subslice(new ($sliceType($Uint8))(buf), 0, w), u);
		} else {
			w = w - (1) >> 0;
			(w < 0 || w >= buf.length) ? $throwRuntimeError("index out of range") : buf[w] = 115;
			_tuple$2 = fmtFrac($subslice(new ($sliceType($Uint8))(buf), 0, w), u, 9); w = _tuple$2[0]; u = _tuple$2[1];
			w = fmtInt($subslice(new ($sliceType($Uint8))(buf), 0, w), $div64(u, new $Uint64(0, 60), true));
			u = $div64(u, (new $Uint64(0, 60)), false);
			if ((u.$high > 0 || (u.$high === 0 && u.$low > 0))) {
				w = w - (1) >> 0;
				(w < 0 || w >= buf.length) ? $throwRuntimeError("index out of range") : buf[w] = 109;
				w = fmtInt($subslice(new ($sliceType($Uint8))(buf), 0, w), $div64(u, new $Uint64(0, 60), true));
				u = $div64(u, (new $Uint64(0, 60)), false);
				if ((u.$high > 0 || (u.$high === 0 && u.$low > 0))) {
					w = w - (1) >> 0;
					(w < 0 || w >= buf.length) ? $throwRuntimeError("index out of range") : buf[w] = 104;
					w = fmtInt($subslice(new ($sliceType($Uint8))(buf), 0, w), u);
				}
			}
		}
		if (neg) {
			w = w - (1) >> 0;
			(w < 0 || w >= buf.length) ? $throwRuntimeError("index out of range") : buf[w] = 45;
		}
		return $bytesToString($subslice(new ($sliceType($Uint8))(buf), w));
	};
	$ptrType(Duration).prototype.String = function() { return this.$get().String(); };
	fmtFrac = function(buf, v, prec) {
		var nw = 0, nv = new $Uint64(0, 0), w, print, i, digit, _tmp, _tmp$1;
		w = buf.$length;
		print = false;
		i = 0;
		while (i < prec) {
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
		var w;
		w = buf.$length;
		if ((v.$high === 0 && v.$low === 0)) {
			w = w - (1) >> 0;
			(w < 0 || w >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + w] = 48;
		} else {
			while ((v.$high > 0 || (v.$high === 0 && v.$low > 0))) {
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
		var d, sec, nsec;
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
	Time.Ptr.prototype.Add = function(d) {
		var t, x, x$1, x$2, x$3, nsec, x$4, x$5, x$6, x$7;
		t = new Time.Ptr(); $copy(t, this, Time);
		t.sec = (x = t.sec, x$1 = (x$2 = $div64(d, new Duration(0, 1000000000), false), new $Int64(x$2.$high, x$2.$low)), new $Int64(x.$high + x$1.$high, x.$low + x$1.$low));
		nsec = (t.nsec >> 0) + ((x$3 = $div64(d, new Duration(0, 1000000000), true), x$3.$low + ((x$3.$high >> 31) * 4294967296)) >> 0) >> 0;
		if (nsec >= 1000000000) {
			t.sec = (x$4 = t.sec, x$5 = new $Int64(0, 1), new $Int64(x$4.$high + x$5.$high, x$4.$low + x$5.$low));
			nsec = nsec - (1000000000) >> 0;
		} else if (nsec < 0) {
			t.sec = (x$6 = t.sec, x$7 = new $Int64(0, 1), new $Int64(x$6.$high - x$7.$high, x$6.$low - x$7.$low));
			nsec = nsec + (1000000000) >> 0;
		}
		t.nsec = (nsec >>> 0);
		return t;
	};
	Time.prototype.Add = function(d) { return this.$val.Add(d); };
	Time.Ptr.prototype.Sub = function(u) {
		var t, x, x$1, x$2, x$3, x$4, d;
		t = new Time.Ptr(); $copy(t, this, Time);
		d = (x = $mul64((x$1 = (x$2 = t.sec, x$3 = u.sec, new $Int64(x$2.$high - x$3.$high, x$2.$low - x$3.$low)), new Duration(x$1.$high, x$1.$low)), new Duration(0, 1000000000)), x$4 = new Duration(0, ((t.nsec >> 0) - (u.nsec >> 0) >> 0)), new Duration(x.$high + x$4.$high, x.$low + x$4.$low));
		if (u.Add(d).Equal($clone(t, Time))) {
			return d;
		} else if (t.Before($clone(u, Time))) {
			return new Duration(-2147483648, 0);
		} else {
			return new Duration(2147483647, 4294967295);
		}
	};
	Time.prototype.Sub = function(u) { return this.$val.Sub(u); };
	Time.Ptr.prototype.AddDate = function(years, months$1, days$1) {
		var t, _tuple$1, year, month, day, _tuple$2, hour, min, sec;
		t = new Time.Ptr(); $copy(t, this, Time);
		_tuple$1 = t.Date(); year = _tuple$1[0]; month = _tuple$1[1]; day = _tuple$1[2];
		_tuple$2 = t.Clock(); hour = _tuple$2[0]; min = _tuple$2[1]; sec = _tuple$2[2];
		return Date(year + years >> 0, month + (months$1 >> 0) >> 0, day + days$1 >> 0, hour, min, sec, (t.nsec >> 0), t.loc);
	};
	Time.prototype.AddDate = function(years, months$1, days$1) { return this.$val.AddDate(years, months$1, days$1); };
	Time.Ptr.prototype.date = function(full) {
		var year = 0, month = 0, day = 0, yday = 0, t, _tuple$1;
		t = new Time.Ptr(); $copy(t, this, Time);
		_tuple$1 = absDate(t.abs(), full); year = _tuple$1[0]; month = _tuple$1[1]; day = _tuple$1[2]; yday = _tuple$1[3];
		return [year, month, day, yday];
	};
	Time.prototype.date = function(full) { return this.$val.date(full); };
	absDate = function(abs, full) {
		var year = 0, month = 0, day = 0, yday = 0, d, n, y, x, x$1, x$2, x$3, x$4, x$5, x$6, x$7, x$8, x$9, x$10, _q, x$11, end, begin;
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
	Time.Ptr.prototype.UTC = function() {
		var t;
		t = new Time.Ptr(); $copy(t, this, Time);
		t.loc = $pkg.UTC;
		return t;
	};
	Time.prototype.UTC = function() { return this.$val.UTC(); };
	Time.Ptr.prototype.Local = function() {
		var t;
		t = new Time.Ptr(); $copy(t, this, Time);
		t.loc = $pkg.Local;
		return t;
	};
	Time.prototype.Local = function() { return this.$val.Local(); };
	Time.Ptr.prototype.In = function(loc) {
		var t;
		t = new Time.Ptr(); $copy(t, this, Time);
		if (loc === ($ptrType(Location)).nil) {
			$panic(new $String("time: missing Location in call to Time.In"));
		}
		t.loc = loc;
		return t;
	};
	Time.prototype.In = function(loc) { return this.$val.In(loc); };
	Time.Ptr.prototype.Location = function() {
		var t, l;
		t = new Time.Ptr(); $copy(t, this, Time);
		l = t.loc;
		if (l === ($ptrType(Location)).nil) {
			l = $pkg.UTC;
		}
		return l;
	};
	Time.prototype.Location = function() { return this.$val.Location(); };
	Time.Ptr.prototype.Zone = function() {
		var name = "", offset = 0, t, _tuple$1, x;
		t = new Time.Ptr(); $copy(t, this, Time);
		_tuple$1 = t.loc.lookup((x = t.sec, new $Int64(x.$high + -15, x.$low + 2288912640))); name = _tuple$1[0]; offset = _tuple$1[1];
		return [name, offset];
	};
	Time.prototype.Zone = function() { return this.$val.Zone(); };
	Time.Ptr.prototype.Unix = function() {
		var t, x;
		t = new Time.Ptr(); $copy(t, this, Time);
		return (x = t.sec, new $Int64(x.$high + -15, x.$low + 2288912640));
	};
	Time.prototype.Unix = function() { return this.$val.Unix(); };
	Time.Ptr.prototype.UnixNano = function() {
		var t, x, x$1, x$2, x$3;
		t = new Time.Ptr(); $copy(t, this, Time);
		return (x = $mul64(((x$1 = t.sec, new $Int64(x$1.$high + -15, x$1.$low + 2288912640))), new $Int64(0, 1000000000)), x$2 = (x$3 = t.nsec, new $Int64(0, x$3.constructor === Number ? x$3 : 1)), new $Int64(x.$high + x$2.$high, x.$low + x$2.$low));
	};
	Time.prototype.UnixNano = function() { return this.$val.UnixNano(); };
	Time.Ptr.prototype.MarshalBinary = function() {
		var t, offsetMin, _tuple$1, offset, _r, _q, enc;
		t = new Time.Ptr(); $copy(t, this, Time);
		offsetMin = 0;
		if (t.Location() === utcLoc) {
			offsetMin = -1;
		} else {
			_tuple$1 = t.Zone(); offset = _tuple$1[1];
			if (!(((_r = offset % 60, _r === _r ? _r : $throwRuntimeError("integer divide by zero")) === 0))) {
				return [($sliceType($Uint8)).nil, errors.New("Time.MarshalBinary: zone offset has fractional minute")];
			}
			offset = (_q = offset / (60), (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero"));
			if (offset < -32768 || (offset === -1) || offset > 32767) {
				return [($sliceType($Uint8)).nil, errors.New("Time.MarshalBinary: unexpected zone offset")];
			}
			offsetMin = (offset << 16 >> 16);
		}
		enc = new ($sliceType($Uint8))([1, ($shiftRightInt64(t.sec, 56).$low << 24 >>> 24), ($shiftRightInt64(t.sec, 48).$low << 24 >>> 24), ($shiftRightInt64(t.sec, 40).$low << 24 >>> 24), ($shiftRightInt64(t.sec, 32).$low << 24 >>> 24), ($shiftRightInt64(t.sec, 24).$low << 24 >>> 24), ($shiftRightInt64(t.sec, 16).$low << 24 >>> 24), ($shiftRightInt64(t.sec, 8).$low << 24 >>> 24), (t.sec.$low << 24 >>> 24), ((t.nsec >>> 24 >>> 0) << 24 >>> 24), ((t.nsec >>> 16 >>> 0) << 24 >>> 24), ((t.nsec >>> 8 >>> 0) << 24 >>> 24), (t.nsec << 24 >>> 24), ((offsetMin >> 8 << 16 >> 16) << 24 >>> 24), (offsetMin << 24 >>> 24)]);
		return [enc, null];
	};
	Time.prototype.MarshalBinary = function() { return this.$val.MarshalBinary(); };
	Time.Ptr.prototype.UnmarshalBinary = function(data$1) {
		var t, buf, x, x$1, x$2, x$3, x$4, x$5, x$6, x$7, x$8, x$9, x$10, x$11, x$12, x$13, x$14, offset, _tuple$1, x$15, localoff;
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
		t.nsec = (((((((3 < 0 || 3 >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + 3]) >> 0) | ((((2 < 0 || 2 >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + 2]) >> 0) << 8 >> 0)) | ((((1 < 0 || 1 >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + 1]) >> 0) << 16 >> 0)) | ((((0 < 0 || 0 >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + 0]) >> 0) << 24 >> 0)) >>> 0);
		buf = $subslice(buf, 4);
		offset = (x$14 = (((((1 < 0 || 1 >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + 1]) << 16 >> 16) | ((((0 < 0 || 0 >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + 0]) << 16 >> 16) << 8 << 16 >> 16)) >> 0), (((x$14 >>> 16 << 16) * 60 >> 0) + (x$14 << 16 >>> 16) * 60) >> 0);
		if (offset === -60) {
			t.loc = utcLoc;
		} else {
			_tuple$1 = $pkg.Local.lookup((x$15 = t.sec, new $Int64(x$15.$high + -15, x$15.$low + 2288912640))); localoff = _tuple$1[1];
			if (offset === localoff) {
				t.loc = $pkg.Local;
			} else {
				t.loc = FixedZone("", offset);
			}
		}
		return null;
	};
	Time.prototype.UnmarshalBinary = function(data$1) { return this.$val.UnmarshalBinary(data$1); };
	Time.Ptr.prototype.GobEncode = function() {
		var t;
		t = new Time.Ptr(); $copy(t, this, Time);
		return t.MarshalBinary();
	};
	Time.prototype.GobEncode = function() { return this.$val.GobEncode(); };
	Time.Ptr.prototype.GobDecode = function(data$1) {
		var t;
		t = this;
		return t.UnmarshalBinary(data$1);
	};
	Time.prototype.GobDecode = function(data$1) { return this.$val.GobDecode(data$1); };
	Time.Ptr.prototype.MarshalJSON = function() {
		var t, y;
		t = new Time.Ptr(); $copy(t, this, Time);
		y = t.Year();
		if (y < 0 || y >= 10000) {
			return [($sliceType($Uint8)).nil, errors.New("Time.MarshalJSON: year outside of range [0,9999]")];
		}
		return [new ($sliceType($Uint8))($stringToBytes(t.Format("\"2006-01-02T15:04:05.999999999Z07:00\""))), null];
	};
	Time.prototype.MarshalJSON = function() { return this.$val.MarshalJSON(); };
	Time.Ptr.prototype.UnmarshalJSON = function(data$1) {
		var err = null, t, _tuple$1;
		t = this;
		_tuple$1 = Parse("\"2006-01-02T15:04:05Z07:00\"", $bytesToString(data$1)); $copy(t, _tuple$1[0], Time); err = _tuple$1[1];
		return err;
	};
	Time.prototype.UnmarshalJSON = function(data$1) { return this.$val.UnmarshalJSON(data$1); };
	Time.Ptr.prototype.MarshalText = function() {
		var t, y;
		t = new Time.Ptr(); $copy(t, this, Time);
		y = t.Year();
		if (y < 0 || y >= 10000) {
			return [($sliceType($Uint8)).nil, errors.New("Time.MarshalText: year outside of range [0,9999]")];
		}
		return [new ($sliceType($Uint8))($stringToBytes(t.Format("2006-01-02T15:04:05.999999999Z07:00"))), null];
	};
	Time.prototype.MarshalText = function() { return this.$val.MarshalText(); };
	Time.Ptr.prototype.UnmarshalText = function(data$1) {
		var err = null, t, _tuple$1;
		t = this;
		_tuple$1 = Parse("2006-01-02T15:04:05Z07:00", $bytesToString(data$1)); $copy(t, _tuple$1[0], Time); err = _tuple$1[1];
		return err;
	};
	Time.prototype.UnmarshalText = function(data$1) { return this.$val.UnmarshalText(data$1); };
	Unix = $pkg.Unix = function(sec, nsec) {
		var n, x, x$1, x$2, x$3;
		if ((nsec.$high < 0 || (nsec.$high === 0 && nsec.$low < 0)) || (nsec.$high > 0 || (nsec.$high === 0 && nsec.$low >= 1000000000))) {
			n = $div64(nsec, new $Int64(0, 1000000000), false);
			sec = (x = n, new $Int64(sec.$high + x.$high, sec.$low + x.$low));
			nsec = (x$1 = $mul64(n, new $Int64(0, 1000000000)), new $Int64(nsec.$high - x$1.$high, nsec.$low - x$1.$low));
			if ((nsec.$high < 0 || (nsec.$high === 0 && nsec.$low < 0))) {
				nsec = (x$2 = new $Int64(0, 1000000000), new $Int64(nsec.$high + x$2.$high, nsec.$low + x$2.$low));
				sec = (x$3 = new $Int64(0, 1), new $Int64(sec.$high - x$3.$high, sec.$low - x$3.$low));
			}
		}
		return new Time.Ptr(new $Int64(sec.$high + 14, sec.$low + 2006054656), (nsec.$low >>> 0), $pkg.Local);
	};
	isLeap = function(year) {
		var _r, _r$1, _r$2;
		return ((_r = year % 4, _r === _r ? _r : $throwRuntimeError("integer divide by zero")) === 0) && (!(((_r$1 = year % 100, _r$1 === _r$1 ? _r$1 : $throwRuntimeError("integer divide by zero")) === 0)) || ((_r$2 = year % 400, _r$2 === _r$2 ? _r$2 : $throwRuntimeError("integer divide by zero")) === 0));
	};
	norm = function(hi, lo, base) {
		var nhi = 0, nlo = 0, _q, n, _q$1, n$1, _tmp, _tmp$1;
		if (lo < 0) {
			n = (_q = ((-lo - 1 >> 0)) / base, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero")) + 1 >> 0;
			hi = hi - (n) >> 0;
			lo = lo + (((((n >>> 16 << 16) * base >> 0) + (n << 16 >>> 16) * base) >> 0)) >> 0;
		}
		if (lo >= base) {
			n$1 = (_q$1 = lo / base, (_q$1 === _q$1 && _q$1 !== 1/0 && _q$1 !== -1/0) ? _q$1 >> 0 : $throwRuntimeError("integer divide by zero"));
			hi = hi + (n$1) >> 0;
			lo = lo - (((((n$1 >>> 16 << 16) * base >> 0) + (n$1 << 16 >>> 16) * base) >> 0)) >> 0;
		}
		_tmp = hi; _tmp$1 = lo; nhi = _tmp; nlo = _tmp$1;
		return [nhi, nlo];
	};
	Date = $pkg.Date = function(year, month, day, hour, min, sec, nsec, loc) {
		var m, _tuple$1, _tuple$2, _tuple$3, _tuple$4, _tuple$5, x, x$1, y, n, x$2, d, x$3, x$4, x$5, x$6, x$7, x$8, x$9, x$10, x$11, abs, x$12, x$13, unix, _tuple$6, offset, start, end, x$14, utc, _tuple$7, _tuple$8, x$15;
		if (loc === ($ptrType(Location)).nil) {
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
		abs = (x$12 = new $Uint64(0, ((((((hour >>> 16 << 16) * 3600 >> 0) + (hour << 16 >>> 16) * 3600) >> 0) + ((((min >>> 16 << 16) * 60 >> 0) + (min << 16 >>> 16) * 60) >> 0) >> 0) + sec >> 0)), new $Uint64(abs.$high + x$12.$high, abs.$low + x$12.$low));
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
		return new Time.Ptr(new $Int64(unix.$high + 14, unix.$low + 2006054656), (nsec >>> 0), loc);
	};
	Time.Ptr.prototype.Truncate = function(d) {
		var t, _tuple$1, r;
		t = new Time.Ptr(); $copy(t, this, Time);
		if ((d.$high < 0 || (d.$high === 0 && d.$low <= 0))) {
			return t;
		}
		_tuple$1 = div($clone(t, Time), d); r = _tuple$1[1];
		return t.Add(new Duration(-r.$high, -r.$low));
	};
	Time.prototype.Truncate = function(d) { return this.$val.Truncate(d); };
	Time.Ptr.prototype.Round = function(d) {
		var t, _tuple$1, r, x;
		t = new Time.Ptr(); $copy(t, this, Time);
		if ((d.$high < 0 || (d.$high === 0 && d.$low <= 0))) {
			return t;
		}
		_tuple$1 = div($clone(t, Time), d); r = _tuple$1[1];
		if ((x = new Duration(r.$high + r.$high, r.$low + r.$low), (x.$high < d.$high || (x.$high === d.$high && x.$low < d.$low)))) {
			return t.Add(new Duration(-r.$high, -r.$low));
		}
		return t.Add(new Duration(d.$high - r.$high, d.$low - r.$low));
	};
	Time.prototype.Round = function(d) { return this.$val.Round(d); };
	div = function(t, d) {
		var qmod2 = 0, r = new Duration(0, 0), neg, nsec, x, x$1, x$2, x$3, x$4, x$5, _q, _r, x$6, d1, x$7, x$8, x$9, x$10, x$11, sec, tmp, u1, u0, _tmp, _tmp$1, u0x, x$12, _tmp$2, _tmp$3, x$13, x$14, d1$1, x$15, d0, _tmp$4, _tmp$5, x$16, x$17, x$18, x$19;
		neg = false;
		nsec = (t.nsec >> 0);
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
			r = new Duration(0, (_r = nsec % ((d.$low + ((d.$high >> 31) * 4294967296)) >> 0), _r === _r ? _r : $throwRuntimeError("integer divide by zero")));
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
			while (!((x$15 = $shiftRightUint64(d1$1, 63), (x$15.$high === 0 && x$15.$low === 1)))) {
				d1$1 = $shiftLeft64(d1$1, (1));
			}
			d0 = new $Uint64(0, 0);
			while (true) {
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
	Location.Ptr.prototype.get = function() {
		var l;
		l = this;
		if (l === ($ptrType(Location)).nil) {
			return utcLoc;
		}
		if (l === localLoc) {
			localOnce.Do(initLocal);
		}
		return l;
	};
	Location.prototype.get = function() { return this.$val.get(); };
	Location.Ptr.prototype.String = function() {
		var l;
		l = this;
		return l.get().name;
	};
	Location.prototype.String = function() { return this.$val.String(); };
	FixedZone = $pkg.FixedZone = function(name, offset) {
		var l, x;
		l = new Location.Ptr(name, new ($sliceType(zone))([new zone.Ptr(name, offset, false)]), new ($sliceType(zoneTrans))([new zoneTrans.Ptr(new $Int64(-2147483648, 0), 0, false, false)]), new $Int64(-2147483648, 0), new $Int64(2147483647, 4294967295), ($ptrType(zone)).nil);
		l.cacheZone = (x = l.zone, ((0 < 0 || 0 >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + 0]));
		return l;
	};
	Location.Ptr.prototype.lookup = function(sec) {
		var name = "", offset = 0, isDST = false, start = new $Int64(0, 0), end = new $Int64(0, 0), l, zone$1, x, x$1, x$2, x$3, x$4, x$5, zone$2, x$6, tx, lo, hi, _q, m, lim, x$7, x$8, zone$3;
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
		if (!(zone$1 === ($ptrType(zone)).nil) && (x = l.cacheStart, (x.$high < sec.$high || (x.$high === sec.$high && x.$low <= sec.$low))) && (x$1 = l.cacheEnd, (sec.$high < x$1.$high || (sec.$high === x$1.$high && sec.$low < x$1.$low)))) {
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
		while ((hi - lo >> 0) > 1) {
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
	Location.Ptr.prototype.lookupFirstZone = function() {
		var l, x, x$1, x$2, x$3, zi, x$4, _ref, _i, zi$1, x$5;
		l = this;
		if (!l.firstZoneUsed()) {
			return 0;
		}
		if (l.tx.$length > 0 && (x = l.zone, x$1 = (x$2 = l.tx, ((0 < 0 || 0 >= x$2.$length) ? $throwRuntimeError("index out of range") : x$2.$array[x$2.$offset + 0])).index, ((x$1 < 0 || x$1 >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + x$1])).isDST) {
			zi = ((x$3 = l.tx, ((0 < 0 || 0 >= x$3.$length) ? $throwRuntimeError("index out of range") : x$3.$array[x$3.$offset + 0])).index >> 0) - 1 >> 0;
			while (zi >= 0) {
				if (!(x$4 = l.zone, ((zi < 0 || zi >= x$4.$length) ? $throwRuntimeError("index out of range") : x$4.$array[x$4.$offset + zi])).isDST) {
					return zi;
				}
				zi = zi - (1) >> 0;
			}
		}
		_ref = l.zone;
		_i = 0;
		while (_i < _ref.$length) {
			zi$1 = _i;
			if (!(x$5 = l.zone, ((zi$1 < 0 || zi$1 >= x$5.$length) ? $throwRuntimeError("index out of range") : x$5.$array[x$5.$offset + zi$1])).isDST) {
				return zi$1;
			}
			_i++;
		}
		return 0;
	};
	Location.prototype.lookupFirstZone = function() { return this.$val.lookupFirstZone(); };
	Location.Ptr.prototype.firstZoneUsed = function() {
		var l, _ref, _i, tx;
		l = this;
		_ref = l.tx;
		_i = 0;
		while (_i < _ref.$length) {
			tx = new zoneTrans.Ptr(); $copy(tx, ((_i < 0 || _i >= _ref.$length) ? $throwRuntimeError("index out of range") : _ref.$array[_ref.$offset + _i]), zoneTrans);
			if (tx.index === 0) {
				return true;
			}
			_i++;
		}
		return false;
	};
	Location.prototype.firstZoneUsed = function() { return this.$val.firstZoneUsed(); };
	Location.Ptr.prototype.lookupName = function(name, unix) {
		var offset = 0, isDST = false, ok = false, l, _ref, _i, i, x, zone$1, _tuple$1, x$1, nam, offset$1, isDST$1, _tmp, _tmp$1, _tmp$2, _ref$1, _i$1, i$1, x$2, zone$2, _tmp$3, _tmp$4, _tmp$5;
		l = this;
		l = l.get();
		_ref = l.zone;
		_i = 0;
		while (_i < _ref.$length) {
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
		while (_i$1 < _ref$1.$length) {
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
	$pkg.$init = function() {
		($ptrType(ParseError)).methods = [["Error", "Error", "", [], [$String], false, -1]];
		ParseError.init([["Layout", "Layout", "", $String, ""], ["Value", "Value", "", $String, ""], ["LayoutElem", "LayoutElem", "", $String, ""], ["ValueElem", "ValueElem", "", $String, ""], ["Message", "Message", "", $String, ""]]);
		Time.methods = [["Add", "Add", "", [Duration], [Time], false, -1], ["AddDate", "AddDate", "", [$Int, $Int, $Int], [Time], false, -1], ["After", "After", "", [Time], [$Bool], false, -1], ["Before", "Before", "", [Time], [$Bool], false, -1], ["Clock", "Clock", "", [], [$Int, $Int, $Int], false, -1], ["Date", "Date", "", [], [$Int, Month, $Int], false, -1], ["Day", "Day", "", [], [$Int], false, -1], ["Equal", "Equal", "", [Time], [$Bool], false, -1], ["Format", "Format", "", [$String], [$String], false, -1], ["GobEncode", "GobEncode", "", [], [($sliceType($Uint8)), $error], false, -1], ["Hour", "Hour", "", [], [$Int], false, -1], ["ISOWeek", "ISOWeek", "", [], [$Int, $Int], false, -1], ["In", "In", "", [($ptrType(Location))], [Time], false, -1], ["IsZero", "IsZero", "", [], [$Bool], false, -1], ["Local", "Local", "", [], [Time], false, -1], ["Location", "Location", "", [], [($ptrType(Location))], false, -1], ["MarshalBinary", "MarshalBinary", "", [], [($sliceType($Uint8)), $error], false, -1], ["MarshalJSON", "MarshalJSON", "", [], [($sliceType($Uint8)), $error], false, -1], ["MarshalText", "MarshalText", "", [], [($sliceType($Uint8)), $error], false, -1], ["Minute", "Minute", "", [], [$Int], false, -1], ["Month", "Month", "", [], [Month], false, -1], ["Nanosecond", "Nanosecond", "", [], [$Int], false, -1], ["Round", "Round", "", [Duration], [Time], false, -1], ["Second", "Second", "", [], [$Int], false, -1], ["String", "String", "", [], [$String], false, -1], ["Sub", "Sub", "", [Time], [Duration], false, -1], ["Truncate", "Truncate", "", [Duration], [Time], false, -1], ["UTC", "UTC", "", [], [Time], false, -1], ["Unix", "Unix", "", [], [$Int64], false, -1], ["UnixNano", "UnixNano", "", [], [$Int64], false, -1], ["Weekday", "Weekday", "", [], [Weekday], false, -1], ["Year", "Year", "", [], [$Int], false, -1], ["YearDay", "YearDay", "", [], [$Int], false, -1], ["Zone", "Zone", "", [], [$String, $Int], false, -1], ["abs", "abs", "time", [], [$Uint64], false, -1], ["date", "date", "time", [$Bool], [$Int, Month, $Int, $Int], false, -1], ["locabs", "locabs", "time", [], [$String, $Int, $Uint64], false, -1]];
		($ptrType(Time)).methods = [["Add", "Add", "", [Duration], [Time], false, -1], ["AddDate", "AddDate", "", [$Int, $Int, $Int], [Time], false, -1], ["After", "After", "", [Time], [$Bool], false, -1], ["Before", "Before", "", [Time], [$Bool], false, -1], ["Clock", "Clock", "", [], [$Int, $Int, $Int], false, -1], ["Date", "Date", "", [], [$Int, Month, $Int], false, -1], ["Day", "Day", "", [], [$Int], false, -1], ["Equal", "Equal", "", [Time], [$Bool], false, -1], ["Format", "Format", "", [$String], [$String], false, -1], ["GobDecode", "GobDecode", "", [($sliceType($Uint8))], [$error], false, -1], ["GobEncode", "GobEncode", "", [], [($sliceType($Uint8)), $error], false, -1], ["Hour", "Hour", "", [], [$Int], false, -1], ["ISOWeek", "ISOWeek", "", [], [$Int, $Int], false, -1], ["In", "In", "", [($ptrType(Location))], [Time], false, -1], ["IsZero", "IsZero", "", [], [$Bool], false, -1], ["Local", "Local", "", [], [Time], false, -1], ["Location", "Location", "", [], [($ptrType(Location))], false, -1], ["MarshalBinary", "MarshalBinary", "", [], [($sliceType($Uint8)), $error], false, -1], ["MarshalJSON", "MarshalJSON", "", [], [($sliceType($Uint8)), $error], false, -1], ["MarshalText", "MarshalText", "", [], [($sliceType($Uint8)), $error], false, -1], ["Minute", "Minute", "", [], [$Int], false, -1], ["Month", "Month", "", [], [Month], false, -1], ["Nanosecond", "Nanosecond", "", [], [$Int], false, -1], ["Round", "Round", "", [Duration], [Time], false, -1], ["Second", "Second", "", [], [$Int], false, -1], ["String", "String", "", [], [$String], false, -1], ["Sub", "Sub", "", [Time], [Duration], false, -1], ["Truncate", "Truncate", "", [Duration], [Time], false, -1], ["UTC", "UTC", "", [], [Time], false, -1], ["Unix", "Unix", "", [], [$Int64], false, -1], ["UnixNano", "UnixNano", "", [], [$Int64], false, -1], ["UnmarshalBinary", "UnmarshalBinary", "", [($sliceType($Uint8))], [$error], false, -1], ["UnmarshalJSON", "UnmarshalJSON", "", [($sliceType($Uint8))], [$error], false, -1], ["UnmarshalText", "UnmarshalText", "", [($sliceType($Uint8))], [$error], false, -1], ["Weekday", "Weekday", "", [], [Weekday], false, -1], ["Year", "Year", "", [], [$Int], false, -1], ["YearDay", "YearDay", "", [], [$Int], false, -1], ["Zone", "Zone", "", [], [$String, $Int], false, -1], ["abs", "abs", "time", [], [$Uint64], false, -1], ["date", "date", "time", [$Bool], [$Int, Month, $Int, $Int], false, -1], ["locabs", "locabs", "time", [], [$String, $Int, $Uint64], false, -1]];
		Time.init([["sec", "sec", "time", $Int64, ""], ["nsec", "nsec", "time", $Uintptr, ""], ["loc", "loc", "time", ($ptrType(Location)), ""]]);
		Month.methods = [["String", "String", "", [], [$String], false, -1]];
		($ptrType(Month)).methods = [["String", "String", "", [], [$String], false, -1]];
		Weekday.methods = [["String", "String", "", [], [$String], false, -1]];
		($ptrType(Weekday)).methods = [["String", "String", "", [], [$String], false, -1]];
		Duration.methods = [["Hours", "Hours", "", [], [$Float64], false, -1], ["Minutes", "Minutes", "", [], [$Float64], false, -1], ["Nanoseconds", "Nanoseconds", "", [], [$Int64], false, -1], ["Seconds", "Seconds", "", [], [$Float64], false, -1], ["String", "String", "", [], [$String], false, -1]];
		($ptrType(Duration)).methods = [["Hours", "Hours", "", [], [$Float64], false, -1], ["Minutes", "Minutes", "", [], [$Float64], false, -1], ["Nanoseconds", "Nanoseconds", "", [], [$Int64], false, -1], ["Seconds", "Seconds", "", [], [$Float64], false, -1], ["String", "String", "", [], [$String], false, -1]];
		($ptrType(Location)).methods = [["String", "String", "", [], [$String], false, -1], ["firstZoneUsed", "firstZoneUsed", "time", [], [$Bool], false, -1], ["get", "get", "time", [], [($ptrType(Location))], false, -1], ["lookup", "lookup", "time", [$Int64], [$String, $Int, $Bool, $Int64, $Int64], false, -1], ["lookupFirstZone", "lookupFirstZone", "time", [], [$Int], false, -1], ["lookupName", "lookupName", "time", [$String, $Int64], [$Int, $Bool, $Bool], false, -1]];
		Location.init([["name", "name", "time", $String, ""], ["zone", "zone", "time", ($sliceType(zone)), ""], ["tx", "tx", "time", ($sliceType(zoneTrans)), ""], ["cacheStart", "cacheStart", "time", $Int64, ""], ["cacheEnd", "cacheEnd", "time", $Int64, ""], ["cacheZone", "cacheZone", "time", ($ptrType(zone)), ""]]);
		zone.init([["name", "name", "time", $String, ""], ["offset", "offset", "time", $Int, ""], ["isDST", "isDST", "time", $Bool, ""]]);
		zoneTrans.init([["when", "when", "time", $Int64, ""], ["index", "index", "time", $Uint8, ""], ["isstd", "isstd", "time", $Bool, ""], ["isutc", "isutc", "time", $Bool, ""]]);
		localLoc = new Location.Ptr();
		localOnce = new sync.Once.Ptr();
		std0x = $toNativeArray("Int", [260, 265, 524, 526, 528, 274]);
		longDayNames = new ($sliceType($String))(["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]);
		shortDayNames = new ($sliceType($String))(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
		shortMonthNames = new ($sliceType($String))(["---", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]);
		longMonthNames = new ($sliceType($String))(["---", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]);
		atoiError = errors.New("time: invalid number");
		errBad = errors.New("bad value for field");
		errLeadingInt = errors.New("time: bad [0-9]*");
		months = $toNativeArray("String", ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]);
		days = $toNativeArray("String", ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]);
		daysBefore = $toNativeArray("Int32", [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365]);
		utcLoc = new Location.Ptr("UTC", ($sliceType(zone)).nil, ($sliceType(zoneTrans)).nil, new $Int64(0, 0), new $Int64(0, 0), ($ptrType(zone)).nil);
		$pkg.UTC = utcLoc;
		$pkg.Local = localLoc;
		_tuple = syscall.Getenv("ZONEINFO"); zoneinfo = _tuple[0];
		badData = errors.New("malformed time zone information");
		zoneDirs = new ($sliceType($String))(["/usr/share/zoneinfo/", "/usr/share/lib/zoneinfo/", "/usr/lib/locale/TZ/", runtime.GOROOT() + "/lib/time/zoneinfo.zip"]);
	};
	return $pkg;
})();
$packages["os"] = (function() {
	var $pkg = {}, js = $packages["github.com/gopherjs/gopherjs/js"], io = $packages["io"], syscall = $packages["syscall"], time = $packages["time"], errors = $packages["errors"], runtime = $packages["runtime"], atomic = $packages["sync/atomic"], sync = $packages["sync"], PathError, SyscallError, LinkError, File, file, dirInfo, FileInfo, FileMode, fileStat, lstat, useSyscallwd, supportsCloseOnExec, init, NewSyscallError, IsNotExist, isNotExist, sigpipe, syscallMode, NewFile, epipecheck, Lstat, basename, init$1, useSyscallwdDarwin, fileInfoFromStat, timespecToTime, init$2;
	PathError = $pkg.PathError = $newType(0, "Struct", "os.PathError", "PathError", "os", function(Op_, Path_, Err_) {
		this.$val = this;
		this.Op = Op_ !== undefined ? Op_ : "";
		this.Path = Path_ !== undefined ? Path_ : "";
		this.Err = Err_ !== undefined ? Err_ : null;
	});
	SyscallError = $pkg.SyscallError = $newType(0, "Struct", "os.SyscallError", "SyscallError", "os", function(Syscall_, Err_) {
		this.$val = this;
		this.Syscall = Syscall_ !== undefined ? Syscall_ : "";
		this.Err = Err_ !== undefined ? Err_ : null;
	});
	LinkError = $pkg.LinkError = $newType(0, "Struct", "os.LinkError", "LinkError", "os", function(Op_, Old_, New_, Err_) {
		this.$val = this;
		this.Op = Op_ !== undefined ? Op_ : "";
		this.Old = Old_ !== undefined ? Old_ : "";
		this.New = New_ !== undefined ? New_ : "";
		this.Err = Err_ !== undefined ? Err_ : null;
	});
	File = $pkg.File = $newType(0, "Struct", "os.File", "File", "os", function(file_) {
		this.$val = this;
		this.file = file_ !== undefined ? file_ : ($ptrType(file)).nil;
	});
	file = $pkg.file = $newType(0, "Struct", "os.file", "file", "os", function(fd_, name_, dirinfo_, nepipe_) {
		this.$val = this;
		this.fd = fd_ !== undefined ? fd_ : 0;
		this.name = name_ !== undefined ? name_ : "";
		this.dirinfo = dirinfo_ !== undefined ? dirinfo_ : ($ptrType(dirInfo)).nil;
		this.nepipe = nepipe_ !== undefined ? nepipe_ : 0;
	});
	dirInfo = $pkg.dirInfo = $newType(0, "Struct", "os.dirInfo", "dirInfo", "os", function(buf_, nbuf_, bufp_) {
		this.$val = this;
		this.buf = buf_ !== undefined ? buf_ : ($sliceType($Uint8)).nil;
		this.nbuf = nbuf_ !== undefined ? nbuf_ : 0;
		this.bufp = bufp_ !== undefined ? bufp_ : 0;
	});
	FileInfo = $pkg.FileInfo = $newType(8, "Interface", "os.FileInfo", "FileInfo", "os", null);
	FileMode = $pkg.FileMode = $newType(4, "Uint32", "os.FileMode", "FileMode", "os", null);
	fileStat = $pkg.fileStat = $newType(0, "Struct", "os.fileStat", "fileStat", "os", function(name_, size_, mode_, modTime_, sys_) {
		this.$val = this;
		this.name = name_ !== undefined ? name_ : "";
		this.size = size_ !== undefined ? size_ : new $Int64(0, 0);
		this.mode = mode_ !== undefined ? mode_ : 0;
		this.modTime = modTime_ !== undefined ? modTime_ : new time.Time.Ptr();
		this.sys = sys_ !== undefined ? sys_ : null;
	});
	init = function() {
		var process, args, i;
		process = $global.process;
		if (process === undefined) {
			$pkg.Args = new ($sliceType($String))(["browser"]);
			return;
		}
		args = process.argv;
		$pkg.Args = ($sliceType($String)).make(($parseInt(args.length) - 1 >> 0));
		i = 0;
		while (i < ($parseInt(args.length) - 1 >> 0)) {
			(i < 0 || i >= $pkg.Args.$length) ? $throwRuntimeError("index out of range") : $pkg.Args.$array[$pkg.Args.$offset + i] = $internalize(args[(i + 1 >> 0)], $String);
			i = i + (1) >> 0;
		}
	};
	File.Ptr.prototype.readdirnames = function(n) {
		var names = ($sliceType($String)).nil, err = null, f, d, size, errno, _tuple, _tmp, _tmp$1, _tmp$2, _tmp$3, nb, nc, _tuple$1, _tmp$4, _tmp$5, _tmp$6, _tmp$7;
		f = this;
		if (f.file.dirinfo === ($ptrType(dirInfo)).nil) {
			f.file.dirinfo = new dirInfo.Ptr();
			f.file.dirinfo.buf = ($sliceType($Uint8)).make(4096);
		}
		d = f.file.dirinfo;
		size = n;
		if (size <= 0) {
			size = 100;
			n = -1;
		}
		names = ($sliceType($String)).make(0, size);
		while (!((n === 0))) {
			if (d.bufp >= d.nbuf) {
				d.bufp = 0;
				errno = null;
				_tuple = syscall.ReadDirent(f.file.fd, d.buf); d.nbuf = _tuple[0]; errno = _tuple[1];
				if (!($interfaceIsEqual(errno, null))) {
					_tmp = names; _tmp$1 = NewSyscallError("readdirent", errno); names = _tmp; err = _tmp$1;
					return [names, err];
				}
				if (d.nbuf <= 0) {
					break;
				}
			}
			_tmp$2 = 0; _tmp$3 = 0; nb = _tmp$2; nc = _tmp$3;
			_tuple$1 = syscall.ParseDirent($subslice(d.buf, d.bufp, d.nbuf), n, names); nb = _tuple$1[0]; nc = _tuple$1[1]; names = _tuple$1[2];
			d.bufp = d.bufp + (nb) >> 0;
			n = n - (nc) >> 0;
		}
		if (n >= 0 && (names.$length === 0)) {
			_tmp$4 = names; _tmp$5 = io.EOF; names = _tmp$4; err = _tmp$5;
			return [names, err];
		}
		_tmp$6 = names; _tmp$7 = null; names = _tmp$6; err = _tmp$7;
		return [names, err];
	};
	File.prototype.readdirnames = function(n) { return this.$val.readdirnames(n); };
	File.Ptr.prototype.Readdir = function(n) {
		var fi = ($sliceType(FileInfo)).nil, err = null, f, _tmp, _tmp$1, _tuple;
		f = this;
		if (f === ($ptrType(File)).nil) {
			_tmp = ($sliceType(FileInfo)).nil; _tmp$1 = $pkg.ErrInvalid; fi = _tmp; err = _tmp$1;
			return [fi, err];
		}
		_tuple = f.readdir(n); fi = _tuple[0]; err = _tuple[1];
		return [fi, err];
	};
	File.prototype.Readdir = function(n) { return this.$val.Readdir(n); };
	File.Ptr.prototype.Readdirnames = function(n) {
		var names = ($sliceType($String)).nil, err = null, f, _tmp, _tmp$1, _tuple;
		f = this;
		if (f === ($ptrType(File)).nil) {
			_tmp = ($sliceType($String)).nil; _tmp$1 = $pkg.ErrInvalid; names = _tmp; err = _tmp$1;
			return [names, err];
		}
		_tuple = f.readdirnames(n); names = _tuple[0]; err = _tuple[1];
		return [names, err];
	};
	File.prototype.Readdirnames = function(n) { return this.$val.Readdirnames(n); };
	PathError.Ptr.prototype.Error = function() {
		var e;
		e = this;
		return e.Op + " " + e.Path + ": " + e.Err.Error();
	};
	PathError.prototype.Error = function() { return this.$val.Error(); };
	SyscallError.Ptr.prototype.Error = function() {
		var e;
		e = this;
		return e.Syscall + ": " + e.Err.Error();
	};
	SyscallError.prototype.Error = function() { return this.$val.Error(); };
	NewSyscallError = $pkg.NewSyscallError = function(syscall$1, err) {
		if ($interfaceIsEqual(err, null)) {
			return null;
		}
		return new SyscallError.Ptr(syscall$1, err);
	};
	IsNotExist = $pkg.IsNotExist = function(err) {
		return isNotExist(err);
	};
	isNotExist = function(err) {
		var pe, _ref, _type;
		_ref = err;
		_type = _ref !== null ? _ref.constructor : null;
		if (_type === null) {
			pe = _ref;
			return false;
		} else if (_type === ($ptrType(PathError))) {
			pe = _ref.$val;
			err = pe.Err;
		} else if (_type === ($ptrType(LinkError))) {
			pe = _ref.$val;
			err = pe.Err;
		}
		return $interfaceIsEqual(err, new syscall.Errno(2)) || $interfaceIsEqual(err, $pkg.ErrNotExist);
	};
	File.Ptr.prototype.Name = function() {
		var f;
		f = this;
		return f.file.name;
	};
	File.prototype.Name = function() { return this.$val.Name(); };
	LinkError.Ptr.prototype.Error = function() {
		var e;
		e = this;
		return e.Op + " " + e.Old + " " + e.New + ": " + e.Err.Error();
	};
	LinkError.prototype.Error = function() { return this.$val.Error(); };
	File.Ptr.prototype.Read = function(b) {
		var n = 0, err = null, f, _tmp, _tmp$1, _tuple, e, _tmp$2, _tmp$3, _tmp$4, _tmp$5;
		f = this;
		if (f === ($ptrType(File)).nil) {
			_tmp = 0; _tmp$1 = $pkg.ErrInvalid; n = _tmp; err = _tmp$1;
			return [n, err];
		}
		_tuple = f.read(b); n = _tuple[0]; e = _tuple[1];
		if (n < 0) {
			n = 0;
		}
		if ((n === 0) && b.$length > 0 && $interfaceIsEqual(e, null)) {
			_tmp$2 = 0; _tmp$3 = io.EOF; n = _tmp$2; err = _tmp$3;
			return [n, err];
		}
		if (!($interfaceIsEqual(e, null))) {
			err = new PathError.Ptr("read", f.file.name, e);
		}
		_tmp$4 = n; _tmp$5 = err; n = _tmp$4; err = _tmp$5;
		return [n, err];
	};
	File.prototype.Read = function(b) { return this.$val.Read(b); };
	File.Ptr.prototype.ReadAt = function(b, off) {
		var n = 0, err = null, f, _tmp, _tmp$1, _tuple, m, e, _tmp$2, _tmp$3, x;
		f = this;
		if (f === ($ptrType(File)).nil) {
			_tmp = 0; _tmp$1 = $pkg.ErrInvalid; n = _tmp; err = _tmp$1;
			return [n, err];
		}
		while (b.$length > 0) {
			_tuple = f.pread(b, off); m = _tuple[0]; e = _tuple[1];
			if ((m === 0) && $interfaceIsEqual(e, null)) {
				_tmp$2 = n; _tmp$3 = io.EOF; n = _tmp$2; err = _tmp$3;
				return [n, err];
			}
			if (!($interfaceIsEqual(e, null))) {
				err = new PathError.Ptr("read", f.file.name, e);
				break;
			}
			n = n + (m) >> 0;
			b = $subslice(b, m);
			off = (x = new $Int64(0, m), new $Int64(off.$high + x.$high, off.$low + x.$low));
		}
		return [n, err];
	};
	File.prototype.ReadAt = function(b, off) { return this.$val.ReadAt(b, off); };
	File.Ptr.prototype.Write = function(b) {
		var n = 0, err = null, f, _tmp, _tmp$1, _tuple, e, _tmp$2, _tmp$3;
		f = this;
		if (f === ($ptrType(File)).nil) {
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
		if (!($interfaceIsEqual(e, null))) {
			err = new PathError.Ptr("write", f.file.name, e);
		}
		_tmp$2 = n; _tmp$3 = err; n = _tmp$2; err = _tmp$3;
		return [n, err];
	};
	File.prototype.Write = function(b) { return this.$val.Write(b); };
	File.Ptr.prototype.WriteAt = function(b, off) {
		var n = 0, err = null, f, _tmp, _tmp$1, _tuple, m, e, x;
		f = this;
		if (f === ($ptrType(File)).nil) {
			_tmp = 0; _tmp$1 = $pkg.ErrInvalid; n = _tmp; err = _tmp$1;
			return [n, err];
		}
		while (b.$length > 0) {
			_tuple = f.pwrite(b, off); m = _tuple[0]; e = _tuple[1];
			if (!($interfaceIsEqual(e, null))) {
				err = new PathError.Ptr("write", f.file.name, e);
				break;
			}
			n = n + (m) >> 0;
			b = $subslice(b, m);
			off = (x = new $Int64(0, m), new $Int64(off.$high + x.$high, off.$low + x.$low));
		}
		return [n, err];
	};
	File.prototype.WriteAt = function(b, off) { return this.$val.WriteAt(b, off); };
	File.Ptr.prototype.Seek = function(offset, whence) {
		var ret = new $Int64(0, 0), err = null, f, _tmp, _tmp$1, _tuple, r, e, _tmp$2, _tmp$3, _tmp$4, _tmp$5;
		f = this;
		if (f === ($ptrType(File)).nil) {
			_tmp = new $Int64(0, 0); _tmp$1 = $pkg.ErrInvalid; ret = _tmp; err = _tmp$1;
			return [ret, err];
		}
		_tuple = f.seek(offset, whence); r = _tuple[0]; e = _tuple[1];
		if ($interfaceIsEqual(e, null) && !(f.file.dirinfo === ($ptrType(dirInfo)).nil) && !((r.$high === 0 && r.$low === 0))) {
			e = new syscall.Errno(21);
		}
		if (!($interfaceIsEqual(e, null))) {
			_tmp$2 = new $Int64(0, 0); _tmp$3 = new PathError.Ptr("seek", f.file.name, e); ret = _tmp$2; err = _tmp$3;
			return [ret, err];
		}
		_tmp$4 = r; _tmp$5 = null; ret = _tmp$4; err = _tmp$5;
		return [ret, err];
	};
	File.prototype.Seek = function(offset, whence) { return this.$val.Seek(offset, whence); };
	File.Ptr.prototype.WriteString = function(s) {
		var ret = 0, err = null, f, _tmp, _tmp$1, _tuple;
		f = this;
		if (f === ($ptrType(File)).nil) {
			_tmp = 0; _tmp$1 = $pkg.ErrInvalid; ret = _tmp; err = _tmp$1;
			return [ret, err];
		}
		_tuple = f.Write(new ($sliceType($Uint8))($stringToBytes(s))); ret = _tuple[0]; err = _tuple[1];
		return [ret, err];
	};
	File.prototype.WriteString = function(s) { return this.$val.WriteString(s); };
	File.Ptr.prototype.Chdir = function() {
		var f, e;
		f = this;
		if (f === ($ptrType(File)).nil) {
			return $pkg.ErrInvalid;
		}
		e = syscall.Fchdir(f.file.fd);
		if (!($interfaceIsEqual(e, null))) {
			return new PathError.Ptr("chdir", f.file.name, e);
		}
		return null;
	};
	File.prototype.Chdir = function() { return this.$val.Chdir(); };
	sigpipe = function() {
		$panic("Native function not implemented: os.sigpipe");
	};
	syscallMode = function(i) {
		var o = 0;
		o = (o | (((new FileMode(i)).Perm() >>> 0))) >>> 0;
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
	File.Ptr.prototype.Chmod = function(mode) {
		var f, e;
		f = this;
		if (f === ($ptrType(File)).nil) {
			return $pkg.ErrInvalid;
		}
		e = syscall.Fchmod(f.file.fd, syscallMode(mode));
		if (!($interfaceIsEqual(e, null))) {
			return new PathError.Ptr("chmod", f.file.name, e);
		}
		return null;
	};
	File.prototype.Chmod = function(mode) { return this.$val.Chmod(mode); };
	File.Ptr.prototype.Chown = function(uid, gid) {
		var f, e;
		f = this;
		if (f === ($ptrType(File)).nil) {
			return $pkg.ErrInvalid;
		}
		e = syscall.Fchown(f.file.fd, uid, gid);
		if (!($interfaceIsEqual(e, null))) {
			return new PathError.Ptr("chown", f.file.name, e);
		}
		return null;
	};
	File.prototype.Chown = function(uid, gid) { return this.$val.Chown(uid, gid); };
	File.Ptr.prototype.Truncate = function(size) {
		var f, e;
		f = this;
		if (f === ($ptrType(File)).nil) {
			return $pkg.ErrInvalid;
		}
		e = syscall.Ftruncate(f.file.fd, size);
		if (!($interfaceIsEqual(e, null))) {
			return new PathError.Ptr("truncate", f.file.name, e);
		}
		return null;
	};
	File.prototype.Truncate = function(size) { return this.$val.Truncate(size); };
	File.Ptr.prototype.Sync = function() {
		var err = null, f, e;
		f = this;
		if (f === ($ptrType(File)).nil) {
			err = $pkg.ErrInvalid;
			return err;
		}
		e = syscall.Fsync(f.file.fd);
		if (!($interfaceIsEqual(e, null))) {
			err = NewSyscallError("fsync", e);
			return err;
		}
		err = null;
		return err;
	};
	File.prototype.Sync = function() { return this.$val.Sync(); };
	File.Ptr.prototype.Fd = function() {
		var f;
		f = this;
		if (f === ($ptrType(File)).nil) {
			return 4294967295;
		}
		return (f.file.fd >>> 0);
	};
	File.prototype.Fd = function() { return this.$val.Fd(); };
	NewFile = $pkg.NewFile = function(fd, name) {
		var fdi, f;
		fdi = (fd >> 0);
		if (fdi < 0) {
			return ($ptrType(File)).nil;
		}
		f = new File.Ptr(new file.Ptr(fdi, name, ($ptrType(dirInfo)).nil, 0));
		runtime.SetFinalizer(f.file, new ($funcType([($ptrType(file))], [$error], false))($methodExpr(($ptrType(file)).prototype.close)));
		return f;
	};
	epipecheck = function(file$1, e) {
		if ($interfaceIsEqual(e, new syscall.Errno(32))) {
			if (atomic.AddInt32(new ($ptrType($Int32))(function() { return this.$target.file.nepipe; }, function($v) { this.$target.file.nepipe = $v; }, file$1), 1) >= 10) {
				sigpipe();
			}
		} else {
			atomic.StoreInt32(new ($ptrType($Int32))(function() { return this.$target.file.nepipe; }, function($v) { this.$target.file.nepipe = $v; }, file$1), 0);
		}
	};
	File.Ptr.prototype.Close = function() {
		var f;
		f = this;
		if (f === ($ptrType(File)).nil) {
			return $pkg.ErrInvalid;
		}
		return f.file.close();
	};
	File.prototype.Close = function() { return this.$val.Close(); };
	file.Ptr.prototype.close = function() {
		var file$1, err, e;
		file$1 = this;
		if (file$1 === ($ptrType(file)).nil || file$1.fd < 0) {
			return new syscall.Errno(22);
		}
		err = null;
		e = syscall.Close(file$1.fd);
		if (!($interfaceIsEqual(e, null))) {
			err = new PathError.Ptr("close", file$1.name, e);
		}
		file$1.fd = -1;
		runtime.SetFinalizer(file$1, null);
		return err;
	};
	file.prototype.close = function() { return this.$val.close(); };
	File.Ptr.prototype.Stat = function() {
		var fi = null, err = null, f, _tmp, _tmp$1, stat, _tmp$2, _tmp$3, _tmp$4, _tmp$5;
		f = this;
		if (f === ($ptrType(File)).nil) {
			_tmp = null; _tmp$1 = $pkg.ErrInvalid; fi = _tmp; err = _tmp$1;
			return [fi, err];
		}
		stat = new syscall.Stat_t.Ptr(); $copy(stat, new syscall.Stat_t.Ptr(), syscall.Stat_t);
		err = syscall.Fstat(f.file.fd, stat);
		if (!($interfaceIsEqual(err, null))) {
			_tmp$2 = null; _tmp$3 = new PathError.Ptr("stat", f.file.name, err); fi = _tmp$2; err = _tmp$3;
			return [fi, err];
		}
		_tmp$4 = fileInfoFromStat(stat, f.file.name); _tmp$5 = null; fi = _tmp$4; err = _tmp$5;
		return [fi, err];
	};
	File.prototype.Stat = function() { return this.$val.Stat(); };
	Lstat = $pkg.Lstat = function(name) {
		var fi = null, err = null, stat, _tmp, _tmp$1, _tmp$2, _tmp$3;
		stat = new syscall.Stat_t.Ptr(); $copy(stat, new syscall.Stat_t.Ptr(), syscall.Stat_t);
		err = syscall.Lstat(name, stat);
		if (!($interfaceIsEqual(err, null))) {
			_tmp = null; _tmp$1 = new PathError.Ptr("lstat", name, err); fi = _tmp; err = _tmp$1;
			return [fi, err];
		}
		_tmp$2 = fileInfoFromStat(stat, name); _tmp$3 = null; fi = _tmp$2; err = _tmp$3;
		return [fi, err];
	};
	File.Ptr.prototype.readdir = function(n) {
		var fi = ($sliceType(FileInfo)).nil, err = null, f, dirname, _tuple, names, _ref, _i, filename, _tuple$1, fip, lerr, _tmp, _tmp$1, _tmp$2, _tmp$3;
		f = this;
		dirname = f.file.name;
		if (dirname === "") {
			dirname = ".";
		}
		_tuple = f.Readdirnames(n); names = _tuple[0]; err = _tuple[1];
		fi = ($sliceType(FileInfo)).make(0, names.$length);
		_ref = names;
		_i = 0;
		while (_i < _ref.$length) {
			filename = ((_i < 0 || _i >= _ref.$length) ? $throwRuntimeError("index out of range") : _ref.$array[_ref.$offset + _i]);
			_tuple$1 = lstat(dirname + "/" + filename); fip = _tuple$1[0]; lerr = _tuple$1[1];
			if (IsNotExist(lerr)) {
				_i++;
				continue;
			}
			if (!($interfaceIsEqual(lerr, null))) {
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
	File.Ptr.prototype.read = function(b) {
		var n = 0, err = null, f, _tuple;
		f = this;
		if (true && b.$length > 1073741824) {
			b = $subslice(b, 0, 1073741824);
		}
		_tuple = syscall.Read(f.file.fd, b); n = _tuple[0]; err = _tuple[1];
		return [n, err];
	};
	File.prototype.read = function(b) { return this.$val.read(b); };
	File.Ptr.prototype.pread = function(b, off) {
		var n = 0, err = null, f, _tuple;
		f = this;
		if (true && b.$length > 1073741824) {
			b = $subslice(b, 0, 1073741824);
		}
		_tuple = syscall.Pread(f.file.fd, b, off); n = _tuple[0]; err = _tuple[1];
		return [n, err];
	};
	File.prototype.pread = function(b, off) { return this.$val.pread(b, off); };
	File.Ptr.prototype.write = function(b) {
		var n = 0, err = null, f, bcap, _tuple, m, err$1, _tmp, _tmp$1;
		f = this;
		while (true) {
			bcap = b;
			if (true && bcap.$length > 1073741824) {
				bcap = $subslice(bcap, 0, 1073741824);
			}
			_tuple = syscall.Write(f.file.fd, bcap); m = _tuple[0]; err$1 = _tuple[1];
			n = n + (m) >> 0;
			if (0 < m && m < bcap.$length || $interfaceIsEqual(err$1, new syscall.Errno(4))) {
				b = $subslice(b, m);
				continue;
			}
			if (true && !((bcap.$length === b.$length)) && $interfaceIsEqual(err$1, null)) {
				b = $subslice(b, m);
				continue;
			}
			_tmp = n; _tmp$1 = err$1; n = _tmp; err = _tmp$1;
			return [n, err];
		}
	};
	File.prototype.write = function(b) { return this.$val.write(b); };
	File.Ptr.prototype.pwrite = function(b, off) {
		var n = 0, err = null, f, _tuple;
		f = this;
		if (true && b.$length > 1073741824) {
			b = $subslice(b, 0, 1073741824);
		}
		_tuple = syscall.Pwrite(f.file.fd, b, off); n = _tuple[0]; err = _tuple[1];
		return [n, err];
	};
	File.prototype.pwrite = function(b, off) { return this.$val.pwrite(b, off); };
	File.Ptr.prototype.seek = function(offset, whence) {
		var ret = new $Int64(0, 0), err = null, f, _tuple;
		f = this;
		_tuple = syscall.Seek(f.file.fd, offset, whence); ret = _tuple[0]; err = _tuple[1];
		return [ret, err];
	};
	File.prototype.seek = function(offset, whence) { return this.$val.seek(offset, whence); };
	basename = function(name) {
		var i;
		i = name.length - 1 >> 0;
		while (i > 0 && (name.charCodeAt(i) === 47)) {
			name = name.substring(0, i);
			i = i - (1) >> 0;
		}
		i = i - (1) >> 0;
		while (i >= 0) {
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
		return !($interfaceIsEqual(err, new syscall.Errno(45)));
	};
	fileInfoFromStat = function(st, name) {
		var fs, _ref;
		fs = new fileStat.Ptr(basename(name), st.Size, 0, timespecToTime($clone(st.Mtimespec, syscall.Timespec)), st);
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
		return time.Unix(ts.Sec, ts.Nsec);
	};
	init$2 = function() {
		var _tuple, osver, err, i, _ref, _i, _rune;
		_tuple = syscall.Sysctl("kern.osrelease"); osver = _tuple[0]; err = _tuple[1];
		if (!($interfaceIsEqual(err, null))) {
			return;
		}
		i = 0;
		_ref = osver;
		_i = 0;
		while (_i < _ref.length) {
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
		var m, buf, w, _ref, _i, _rune, i, c, y, _ref$1, _i$1, _rune$1, i$1, c$1, y$1;
		m = this.$val !== undefined ? this.$val : this;
		buf = ($arrayType($Uint8, 32)).zero(); $copy(buf, ($arrayType($Uint8, 32)).zero(), ($arrayType($Uint8, 32)));
		w = 0;
		_ref = "dalTLDpSugct";
		_i = 0;
		while (_i < _ref.length) {
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
		while (_i$1 < _ref$1.length) {
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
		return $bytesToString($subslice(new ($sliceType($Uint8))(buf), 0, w));
	};
	$ptrType(FileMode).prototype.String = function() { return new FileMode(this.$get()).String(); };
	FileMode.prototype.IsDir = function() {
		var m;
		m = this.$val !== undefined ? this.$val : this;
		return !((((m & 2147483648) >>> 0) === 0));
	};
	$ptrType(FileMode).prototype.IsDir = function() { return new FileMode(this.$get()).IsDir(); };
	FileMode.prototype.IsRegular = function() {
		var m;
		m = this.$val !== undefined ? this.$val : this;
		return ((m & 2399141888) >>> 0) === 0;
	};
	$ptrType(FileMode).prototype.IsRegular = function() { return new FileMode(this.$get()).IsRegular(); };
	FileMode.prototype.Perm = function() {
		var m;
		m = this.$val !== undefined ? this.$val : this;
		return (m & 511) >>> 0;
	};
	$ptrType(FileMode).prototype.Perm = function() { return new FileMode(this.$get()).Perm(); };
	fileStat.Ptr.prototype.Name = function() {
		var fs;
		fs = this;
		return fs.name;
	};
	fileStat.prototype.Name = function() { return this.$val.Name(); };
	fileStat.Ptr.prototype.IsDir = function() {
		var fs;
		fs = this;
		return (new FileMode(fs.Mode())).IsDir();
	};
	fileStat.prototype.IsDir = function() { return this.$val.IsDir(); };
	fileStat.Ptr.prototype.Size = function() {
		var fs;
		fs = this;
		return fs.size;
	};
	fileStat.prototype.Size = function() { return this.$val.Size(); };
	fileStat.Ptr.prototype.Mode = function() {
		var fs;
		fs = this;
		return fs.mode;
	};
	fileStat.prototype.Mode = function() { return this.$val.Mode(); };
	fileStat.Ptr.prototype.ModTime = function() {
		var fs;
		fs = this;
		return fs.modTime;
	};
	fileStat.prototype.ModTime = function() { return this.$val.ModTime(); };
	fileStat.Ptr.prototype.Sys = function() {
		var fs;
		fs = this;
		return fs.sys;
	};
	fileStat.prototype.Sys = function() { return this.$val.Sys(); };
	$pkg.$init = function() {
		($ptrType(PathError)).methods = [["Error", "Error", "", [], [$String], false, -1]];
		PathError.init([["Op", "Op", "", $String, ""], ["Path", "Path", "", $String, ""], ["Err", "Err", "", $error, ""]]);
		($ptrType(SyscallError)).methods = [["Error", "Error", "", [], [$String], false, -1]];
		SyscallError.init([["Syscall", "Syscall", "", $String, ""], ["Err", "Err", "", $error, ""]]);
		($ptrType(LinkError)).methods = [["Error", "Error", "", [], [$String], false, -1]];
		LinkError.init([["Op", "Op", "", $String, ""], ["Old", "Old", "", $String, ""], ["New", "New", "", $String, ""], ["Err", "Err", "", $error, ""]]);
		File.methods = [["close", "close", "os", [], [$error], false, 0]];
		($ptrType(File)).methods = [["Chdir", "Chdir", "", [], [$error], false, -1], ["Chmod", "Chmod", "", [FileMode], [$error], false, -1], ["Chown", "Chown", "", [$Int, $Int], [$error], false, -1], ["Close", "Close", "", [], [$error], false, -1], ["Fd", "Fd", "", [], [$Uintptr], false, -1], ["Name", "Name", "", [], [$String], false, -1], ["Read", "Read", "", [($sliceType($Uint8))], [$Int, $error], false, -1], ["ReadAt", "ReadAt", "", [($sliceType($Uint8)), $Int64], [$Int, $error], false, -1], ["Readdir", "Readdir", "", [$Int], [($sliceType(FileInfo)), $error], false, -1], ["Readdirnames", "Readdirnames", "", [$Int], [($sliceType($String)), $error], false, -1], ["Seek", "Seek", "", [$Int64, $Int], [$Int64, $error], false, -1], ["Stat", "Stat", "", [], [FileInfo, $error], false, -1], ["Sync", "Sync", "", [], [$error], false, -1], ["Truncate", "Truncate", "", [$Int64], [$error], false, -1], ["Write", "Write", "", [($sliceType($Uint8))], [$Int, $error], false, -1], ["WriteAt", "WriteAt", "", [($sliceType($Uint8)), $Int64], [$Int, $error], false, -1], ["WriteString", "WriteString", "", [$String], [$Int, $error], false, -1], ["close", "close", "os", [], [$error], false, 0], ["pread", "pread", "os", [($sliceType($Uint8)), $Int64], [$Int, $error], false, -1], ["pwrite", "pwrite", "os", [($sliceType($Uint8)), $Int64], [$Int, $error], false, -1], ["read", "read", "os", [($sliceType($Uint8))], [$Int, $error], false, -1], ["readdir", "readdir", "os", [$Int], [($sliceType(FileInfo)), $error], false, -1], ["readdirnames", "readdirnames", "os", [$Int], [($sliceType($String)), $error], false, -1], ["seek", "seek", "os", [$Int64, $Int], [$Int64, $error], false, -1], ["write", "write", "os", [($sliceType($Uint8))], [$Int, $error], false, -1]];
		File.init([["file", "", "os", ($ptrType(file)), ""]]);
		($ptrType(file)).methods = [["close", "close", "os", [], [$error], false, -1]];
		file.init([["fd", "fd", "os", $Int, ""], ["name", "name", "os", $String, ""], ["dirinfo", "dirinfo", "os", ($ptrType(dirInfo)), ""], ["nepipe", "nepipe", "os", $Int32, ""]]);
		dirInfo.init([["buf", "buf", "os", ($sliceType($Uint8)), ""], ["nbuf", "nbuf", "os", $Int, ""], ["bufp", "bufp", "os", $Int, ""]]);
		FileInfo.init([["IsDir", "IsDir", "", [], [$Bool], false], ["ModTime", "ModTime", "", [], [time.Time], false], ["Mode", "Mode", "", [], [FileMode], false], ["Name", "Name", "", [], [$String], false], ["Size", "Size", "", [], [$Int64], false], ["Sys", "Sys", "", [], [$emptyInterface], false]]);
		FileMode.methods = [["IsDir", "IsDir", "", [], [$Bool], false, -1], ["IsRegular", "IsRegular", "", [], [$Bool], false, -1], ["Perm", "Perm", "", [], [FileMode], false, -1], ["String", "String", "", [], [$String], false, -1]];
		($ptrType(FileMode)).methods = [["IsDir", "IsDir", "", [], [$Bool], false, -1], ["IsRegular", "IsRegular", "", [], [$Bool], false, -1], ["Perm", "Perm", "", [], [FileMode], false, -1], ["String", "String", "", [], [$String], false, -1]];
		($ptrType(fileStat)).methods = [["IsDir", "IsDir", "", [], [$Bool], false, -1], ["ModTime", "ModTime", "", [], [time.Time], false, -1], ["Mode", "Mode", "", [], [FileMode], false, -1], ["Name", "Name", "", [], [$String], false, -1], ["Size", "Size", "", [], [$Int64], false, -1], ["Sys", "Sys", "", [], [$emptyInterface], false, -1]];
		fileStat.init([["name", "name", "os", $String, ""], ["size", "size", "os", $Int64, ""], ["mode", "mode", "os", FileMode, ""], ["modTime", "modTime", "os", time.Time, ""], ["sys", "sys", "os", $emptyInterface, ""]]);
		$pkg.Args = ($sliceType($String)).nil;
		supportsCloseOnExec = false;
		$pkg.ErrInvalid = errors.New("invalid argument");
		$pkg.ErrPermission = errors.New("permission denied");
		$pkg.ErrExist = errors.New("file already exists");
		$pkg.ErrNotExist = errors.New("file does not exist");
		$pkg.Stdin = NewFile((syscall.Stdin >>> 0), "/dev/stdin");
		$pkg.Stdout = NewFile((syscall.Stdout >>> 0), "/dev/stdout");
		$pkg.Stderr = NewFile((syscall.Stderr >>> 0), "/dev/stderr");
		useSyscallwd = (function() {
			return true;
		});
		lstat = Lstat;
		init();
		init$1();
		init$2();
	};
	return $pkg;
})();
$packages["strconv"] = (function() {
	var $pkg = {}, math = $packages["math"], errors = $packages["errors"], utf8 = $packages["unicode/utf8"], decimal, leftCheat, extFloat, floatInfo, decimalSlice, optimize, leftcheats, smallPowersOfTen, powersOfTen, uint64pow10, float32info, float64info, isPrint16, isNotPrint16, isPrint32, isNotPrint32, shifts, digitZero, trim, rightShift, prefixIsLessThan, leftShift, shouldRoundUp, frexp10Many, adjustLastDigitFixed, adjustLastDigit, AppendFloat, genericFtoa, bigFtoa, formatDigits, roundShortest, fmtE, fmtF, fmtB, max, FormatInt, Itoa, formatBits, quoteWith, Quote, QuoteToASCII, QuoteRune, AppendQuoteRune, QuoteRuneToASCII, AppendQuoteRuneToASCII, CanBackquote, unhex, UnquoteChar, Unquote, contains, bsearch16, bsearch32, IsPrint;
	decimal = $pkg.decimal = $newType(0, "Struct", "strconv.decimal", "decimal", "strconv", function(d_, nd_, dp_, neg_, trunc_) {
		this.$val = this;
		this.d = d_ !== undefined ? d_ : ($arrayType($Uint8, 800)).zero();
		this.nd = nd_ !== undefined ? nd_ : 0;
		this.dp = dp_ !== undefined ? dp_ : 0;
		this.neg = neg_ !== undefined ? neg_ : false;
		this.trunc = trunc_ !== undefined ? trunc_ : false;
	});
	leftCheat = $pkg.leftCheat = $newType(0, "Struct", "strconv.leftCheat", "leftCheat", "strconv", function(delta_, cutoff_) {
		this.$val = this;
		this.delta = delta_ !== undefined ? delta_ : 0;
		this.cutoff = cutoff_ !== undefined ? cutoff_ : "";
	});
	extFloat = $pkg.extFloat = $newType(0, "Struct", "strconv.extFloat", "extFloat", "strconv", function(mant_, exp_, neg_) {
		this.$val = this;
		this.mant = mant_ !== undefined ? mant_ : new $Uint64(0, 0);
		this.exp = exp_ !== undefined ? exp_ : 0;
		this.neg = neg_ !== undefined ? neg_ : false;
	});
	floatInfo = $pkg.floatInfo = $newType(0, "Struct", "strconv.floatInfo", "floatInfo", "strconv", function(mantbits_, expbits_, bias_) {
		this.$val = this;
		this.mantbits = mantbits_ !== undefined ? mantbits_ : 0;
		this.expbits = expbits_ !== undefined ? expbits_ : 0;
		this.bias = bias_ !== undefined ? bias_ : 0;
	});
	decimalSlice = $pkg.decimalSlice = $newType(0, "Struct", "strconv.decimalSlice", "decimalSlice", "strconv", function(d_, nd_, dp_, neg_) {
		this.$val = this;
		this.d = d_ !== undefined ? d_ : ($sliceType($Uint8)).nil;
		this.nd = nd_ !== undefined ? nd_ : 0;
		this.dp = dp_ !== undefined ? dp_ : 0;
		this.neg = neg_ !== undefined ? neg_ : false;
	});
	decimal.Ptr.prototype.String = function() {
		var a, n, buf, w;
		a = this;
		n = 10 + a.nd >> 0;
		if (a.dp > 0) {
			n = n + (a.dp) >> 0;
		}
		if (a.dp < 0) {
			n = n + (-a.dp) >> 0;
		}
		buf = ($sliceType($Uint8)).make(n);
		w = 0;
		if (a.nd === 0) {
			return "0";
		} else if (a.dp <= 0) {
			(w < 0 || w >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + w] = 48;
			w = w + (1) >> 0;
			(w < 0 || w >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + w] = 46;
			w = w + (1) >> 0;
			w = w + (digitZero($subslice(buf, w, (w + -a.dp >> 0)))) >> 0;
			w = w + ($copySlice($subslice(buf, w), $subslice(new ($sliceType($Uint8))(a.d), 0, a.nd))) >> 0;
		} else if (a.dp < a.nd) {
			w = w + ($copySlice($subslice(buf, w), $subslice(new ($sliceType($Uint8))(a.d), 0, a.dp))) >> 0;
			(w < 0 || w >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + w] = 46;
			w = w + (1) >> 0;
			w = w + ($copySlice($subslice(buf, w), $subslice(new ($sliceType($Uint8))(a.d), a.dp, a.nd))) >> 0;
		} else {
			w = w + ($copySlice($subslice(buf, w), $subslice(new ($sliceType($Uint8))(a.d), 0, a.nd))) >> 0;
			w = w + (digitZero($subslice(buf, w, ((w + a.dp >> 0) - a.nd >> 0)))) >> 0;
		}
		return $bytesToString($subslice(buf, 0, w));
	};
	decimal.prototype.String = function() { return this.$val.String(); };
	digitZero = function(dst) {
		var _ref, _i, i;
		_ref = dst;
		_i = 0;
		while (_i < _ref.$length) {
			i = _i;
			(i < 0 || i >= dst.$length) ? $throwRuntimeError("index out of range") : dst.$array[dst.$offset + i] = 48;
			_i++;
		}
		return dst.$length;
	};
	trim = function(a) {
		var x, x$1;
		while (a.nd > 0 && ((x = a.d, x$1 = a.nd - 1 >> 0, ((x$1 < 0 || x$1 >= x.length) ? $throwRuntimeError("index out of range") : x[x$1])) === 48)) {
			a.nd = a.nd - (1) >> 0;
		}
		if (a.nd === 0) {
			a.dp = 0;
		}
	};
	decimal.Ptr.prototype.Assign = function(v) {
		var a, buf, n, v1, x, x$1, x$2;
		a = this;
		buf = ($arrayType($Uint8, 24)).zero(); $copy(buf, ($arrayType($Uint8, 24)).zero(), ($arrayType($Uint8, 24)));
		n = 0;
		while ((v.$high > 0 || (v.$high === 0 && v.$low > 0))) {
			v1 = $div64(v, new $Uint64(0, 10), false);
			v = (x = $mul64(new $Uint64(0, 10), v1), new $Uint64(v.$high - x.$high, v.$low - x.$low));
			(n < 0 || n >= buf.length) ? $throwRuntimeError("index out of range") : buf[n] = (new $Uint64(v.$high + 0, v.$low + 48).$low << 24 >>> 24);
			n = n + (1) >> 0;
			v = v1;
		}
		a.nd = 0;
		n = n - (1) >> 0;
		while (n >= 0) {
			(x$1 = a.d, x$2 = a.nd, (x$2 < 0 || x$2 >= x$1.length) ? $throwRuntimeError("index out of range") : x$1[x$2] = ((n < 0 || n >= buf.length) ? $throwRuntimeError("index out of range") : buf[n]));
			a.nd = a.nd + (1) >> 0;
			n = n - (1) >> 0;
		}
		a.dp = a.nd;
		trim(a);
	};
	decimal.prototype.Assign = function(v) { return this.$val.Assign(v); };
	rightShift = function(a, k) {
		var r, w, n, x, c, x$1, c$1, dig, y, x$2, dig$1, y$1, x$3;
		r = 0;
		w = 0;
		n = 0;
		while (((n >> $min(k, 31)) >> 0) === 0) {
			if (r >= a.nd) {
				if (n === 0) {
					a.nd = 0;
					return;
				}
				while (((n >> $min(k, 31)) >> 0) === 0) {
					n = (((n >>> 16 << 16) * 10 >> 0) + (n << 16 >>> 16) * 10) >> 0;
					r = r + (1) >> 0;
				}
				break;
			}
			c = ((x = a.d, ((r < 0 || r >= x.length) ? $throwRuntimeError("index out of range") : x[r])) >> 0);
			n = (((((n >>> 16 << 16) * 10 >> 0) + (n << 16 >>> 16) * 10) >> 0) + c >> 0) - 48 >> 0;
			r = r + (1) >> 0;
		}
		a.dp = a.dp - ((r - 1 >> 0)) >> 0;
		while (r < a.nd) {
			c$1 = ((x$1 = a.d, ((r < 0 || r >= x$1.length) ? $throwRuntimeError("index out of range") : x$1[r])) >> 0);
			dig = (n >> $min(k, 31)) >> 0;
			n = n - (((y = k, y < 32 ? (dig << y) : 0) >> 0)) >> 0;
			(x$2 = a.d, (w < 0 || w >= x$2.length) ? $throwRuntimeError("index out of range") : x$2[w] = ((dig + 48 >> 0) << 24 >>> 24));
			w = w + (1) >> 0;
			n = (((((n >>> 16 << 16) * 10 >> 0) + (n << 16 >>> 16) * 10) >> 0) + c$1 >> 0) - 48 >> 0;
			r = r + (1) >> 0;
		}
		while (n > 0) {
			dig$1 = (n >> $min(k, 31)) >> 0;
			n = n - (((y$1 = k, y$1 < 32 ? (dig$1 << y$1) : 0) >> 0)) >> 0;
			if (w < 800) {
				(x$3 = a.d, (w < 0 || w >= x$3.length) ? $throwRuntimeError("index out of range") : x$3[w] = ((dig$1 + 48 >> 0) << 24 >>> 24));
				w = w + (1) >> 0;
			} else if (dig$1 > 0) {
				a.trunc = true;
			}
			n = (((n >>> 16 << 16) * 10 >> 0) + (n << 16 >>> 16) * 10) >> 0;
		}
		a.nd = w;
		trim(a);
	};
	prefixIsLessThan = function(b, s) {
		var i;
		i = 0;
		while (i < s.length) {
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
		var delta, r, w, n, y, x, _q, quo, rem, x$1, _q$1, quo$1, rem$1, x$2;
		delta = ((k < 0 || k >= leftcheats.$length) ? $throwRuntimeError("index out of range") : leftcheats.$array[leftcheats.$offset + k]).delta;
		if (prefixIsLessThan($subslice(new ($sliceType($Uint8))(a.d), 0, a.nd), ((k < 0 || k >= leftcheats.$length) ? $throwRuntimeError("index out of range") : leftcheats.$array[leftcheats.$offset + k]).cutoff)) {
			delta = delta - (1) >> 0;
		}
		r = a.nd;
		w = a.nd + delta >> 0;
		n = 0;
		r = r - (1) >> 0;
		while (r >= 0) {
			n = n + (((y = k, y < 32 ? (((((x = a.d, ((r < 0 || r >= x.length) ? $throwRuntimeError("index out of range") : x[r])) >> 0) - 48 >> 0)) << y) : 0) >> 0)) >> 0;
			quo = (_q = n / 10, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero"));
			rem = n - ((((10 >>> 16 << 16) * quo >> 0) + (10 << 16 >>> 16) * quo) >> 0) >> 0;
			w = w - (1) >> 0;
			if (w < 800) {
				(x$1 = a.d, (w < 0 || w >= x$1.length) ? $throwRuntimeError("index out of range") : x$1[w] = ((rem + 48 >> 0) << 24 >>> 24));
			} else if (!((rem === 0))) {
				a.trunc = true;
			}
			n = quo;
			r = r - (1) >> 0;
		}
		while (n > 0) {
			quo$1 = (_q$1 = n / 10, (_q$1 === _q$1 && _q$1 !== 1/0 && _q$1 !== -1/0) ? _q$1 >> 0 : $throwRuntimeError("integer divide by zero"));
			rem$1 = n - ((((10 >>> 16 << 16) * quo$1 >> 0) + (10 << 16 >>> 16) * quo$1) >> 0) >> 0;
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
	decimal.Ptr.prototype.Shift = function(k) {
		var a;
		a = this;
		if (a.nd === 0) {
		} else if (k > 0) {
			while (k > 27) {
				leftShift(a, 27);
				k = k - (27) >> 0;
			}
			leftShift(a, (k >>> 0));
		} else if (k < 0) {
			while (k < -27) {
				rightShift(a, 27);
				k = k + (27) >> 0;
			}
			rightShift(a, (-k >>> 0));
		}
	};
	decimal.prototype.Shift = function(k) { return this.$val.Shift(k); };
	shouldRoundUp = function(a, nd) {
		var x, _r, x$1, x$2, x$3;
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
	decimal.Ptr.prototype.Round = function(nd) {
		var a;
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
	decimal.Ptr.prototype.RoundDown = function(nd) {
		var a;
		a = this;
		if (nd < 0 || nd >= a.nd) {
			return;
		}
		a.nd = nd;
		trim(a);
	};
	decimal.prototype.RoundDown = function(nd) { return this.$val.RoundDown(nd); };
	decimal.Ptr.prototype.RoundUp = function(nd) {
		var a, i, x, c, _lhs, _index;
		a = this;
		if (nd < 0 || nd >= a.nd) {
			return;
		}
		i = nd - 1 >> 0;
		while (i >= 0) {
			c = (x = a.d, ((i < 0 || i >= x.length) ? $throwRuntimeError("index out of range") : x[i]));
			if (c < 57) {
				_lhs = a.d; _index = i; (_index < 0 || _index >= _lhs.length) ? $throwRuntimeError("index out of range") : _lhs[_index] = ((_index < 0 || _index >= _lhs.length) ? $throwRuntimeError("index out of range") : _lhs[_index]) + (1) << 24 >>> 24;
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
	decimal.Ptr.prototype.RoundedInteger = function() {
		var a, i, n, x, x$1, x$2, x$3;
		a = this;
		if (a.dp > 20) {
			return new $Uint64(4294967295, 4294967295);
		}
		i = 0;
		n = new $Uint64(0, 0);
		i = 0;
		while (i < a.dp && i < a.nd) {
			n = (x = $mul64(n, new $Uint64(0, 10)), x$1 = new $Uint64(0, ((x$2 = a.d, ((i < 0 || i >= x$2.length) ? $throwRuntimeError("index out of range") : x$2[i])) - 48 << 24 >>> 24)), new $Uint64(x.$high + x$1.$high, x.$low + x$1.$low));
			i = i + (1) >> 0;
		}
		while (i < a.dp) {
			n = $mul64(n, (new $Uint64(0, 10)));
			i = i + (1) >> 0;
		}
		if (shouldRoundUp(a, a.dp)) {
			n = (x$3 = new $Uint64(0, 1), new $Uint64(n.$high + x$3.$high, n.$low + x$3.$low));
		}
		return n;
	};
	decimal.prototype.RoundedInteger = function() { return this.$val.RoundedInteger(); };
	extFloat.Ptr.prototype.AssignComputeBounds = function(mant, exp, neg, flt) {
		var lower = new extFloat.Ptr(), upper = new extFloat.Ptr(), f, x, _tmp, _tmp$1, expBiased, x$1, x$2, x$3, x$4;
		f = this;
		f.mant = mant;
		f.exp = exp - (flt.mantbits >> 0) >> 0;
		f.neg = neg;
		if (f.exp <= 0 && (x = $shiftLeft64(($shiftRightUint64(mant, (-f.exp >>> 0))), (-f.exp >>> 0)), (mant.$high === x.$high && mant.$low === x.$low))) {
			f.mant = $shiftRightUint64(f.mant, ((-f.exp >>> 0)));
			f.exp = 0;
			_tmp = new extFloat.Ptr(); $copy(_tmp, f, extFloat); _tmp$1 = new extFloat.Ptr(); $copy(_tmp$1, f, extFloat); $copy(lower, _tmp, extFloat); $copy(upper, _tmp$1, extFloat);
			return [lower, upper];
		}
		expBiased = exp - flt.bias >> 0;
		$copy(upper, new extFloat.Ptr((x$1 = $mul64(new $Uint64(0, 2), f.mant), new $Uint64(x$1.$high + 0, x$1.$low + 1)), f.exp - 1 >> 0, f.neg), extFloat);
		if (!((x$2 = $shiftLeft64(new $Uint64(0, 1), flt.mantbits), (mant.$high === x$2.$high && mant.$low === x$2.$low))) || (expBiased === 1)) {
			$copy(lower, new extFloat.Ptr((x$3 = $mul64(new $Uint64(0, 2), f.mant), new $Uint64(x$3.$high - 0, x$3.$low - 1)), f.exp - 1 >> 0, f.neg), extFloat);
		} else {
			$copy(lower, new extFloat.Ptr((x$4 = $mul64(new $Uint64(0, 4), f.mant), new $Uint64(x$4.$high - 0, x$4.$low - 1)), f.exp - 2 >> 0, f.neg), extFloat);
		}
		return [lower, upper];
	};
	extFloat.prototype.AssignComputeBounds = function(mant, exp, neg, flt) { return this.$val.AssignComputeBounds(mant, exp, neg, flt); };
	extFloat.Ptr.prototype.Normalize = function() {
		var shift = 0, f, _tmp, _tmp$1, mant, exp, x, x$1, x$2, x$3, x$4, x$5, _tmp$2, _tmp$3;
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
	extFloat.Ptr.prototype.Multiply = function(g) {
		var f, _tmp, _tmp$1, fhi, flo, _tmp$2, _tmp$3, ghi, glo, cross1, cross2, x, x$1, x$2, x$3, x$4, x$5, x$6, x$7, rem, x$8, x$9, x$10;
		f = this;
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
	extFloat.Ptr.prototype.AssignDecimal = function(mantissa, exp10, neg, trunc, flt) {
		var ok = false, f, errors$1, _q, i, _r, adjExp, x, x$1, shift, y, denormalExp, extrabits, halfway, x$2, x$3, x$4, mant_extra, x$5, x$6, x$7, x$8, x$9, x$10, x$11, x$12;
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
			f.Multiply($clone(((adjExp < 0 || adjExp >= smallPowersOfTen.length) ? $throwRuntimeError("index out of range") : smallPowersOfTen[adjExp]), extFloat));
			errors$1 = errors$1 + (4) >> 0;
		}
		f.Multiply($clone(((i < 0 || i >= powersOfTen.length) ? $throwRuntimeError("index out of range") : powersOfTen[i]), extFloat));
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
	extFloat.Ptr.prototype.frexp10 = function() {
		var exp10 = 0, index = 0, f, _q, x, approxExp10, _q$1, i, exp, _tmp, _tmp$1;
		f = this;
		approxExp10 = (_q = (x = (-46 - f.exp >> 0), (((x >>> 16 << 16) * 28 >> 0) + (x << 16 >>> 16) * 28) >> 0) / 93, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero"));
		i = (_q$1 = ((approxExp10 - -348 >> 0)) / 8, (_q$1 === _q$1 && _q$1 !== 1/0 && _q$1 !== -1/0) ? _q$1 >> 0 : $throwRuntimeError("integer divide by zero"));
		Loop:
		while (true) {
			exp = (f.exp + ((i < 0 || i >= powersOfTen.length) ? $throwRuntimeError("index out of range") : powersOfTen[i]).exp >> 0) + 64 >> 0;
			if (exp < -60) {
				i = i + (1) >> 0;
			} else if (exp > -32) {
				i = i - (1) >> 0;
			} else {
				break Loop;
			}
		}
		f.Multiply($clone(((i < 0 || i >= powersOfTen.length) ? $throwRuntimeError("index out of range") : powersOfTen[i]), extFloat));
		_tmp = -((-348 + ((((i >>> 16 << 16) * 8 >> 0) + (i << 16 >>> 16) * 8) >> 0) >> 0)); _tmp$1 = i; exp10 = _tmp; index = _tmp$1;
		return [exp10, index];
	};
	extFloat.prototype.frexp10 = function() { return this.$val.frexp10(); };
	frexp10Many = function(a, b, c) {
		var exp10 = 0, _tuple, i;
		_tuple = c.frexp10(); exp10 = _tuple[0]; i = _tuple[1];
		a.Multiply($clone(((i < 0 || i >= powersOfTen.length) ? $throwRuntimeError("index out of range") : powersOfTen[i]), extFloat));
		b.Multiply($clone(((i < 0 || i >= powersOfTen.length) ? $throwRuntimeError("index out of range") : powersOfTen[i]), extFloat));
		return exp10;
	};
	extFloat.Ptr.prototype.FixedDecimal = function(d, n) {
		var f, x, _tuple, exp10, shift, integer, x$1, x$2, fraction, nonAsciiName, needed, integerDigits, pow10, _tmp, _tmp$1, i, pow, x$3, rest, x$4, _q, x$5, buf, pos, v, _q$1, v1, i$1, x$6, x$7, nd, x$8, x$9, digit, x$10, x$11, x$12, ok, i$2, x$13;
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
		while (i < 20) {
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
		buf = ($arrayType($Uint8, 32)).zero(); $copy(buf, ($arrayType($Uint8, 32)).zero(), ($arrayType($Uint8, 32)));
		pos = 32;
		v = integer;
		while (v > 0) {
			v1 = (_q$1 = v / 10, (_q$1 === _q$1 && _q$1 !== 1/0 && _q$1 !== -1/0) ? _q$1 >>> 0 : $throwRuntimeError("integer divide by zero"));
			v = v - (((((10 >>> 16 << 16) * v1 >>> 0) + (10 << 16 >>> 16) * v1) >>> 0)) >>> 0;
			pos = pos - (1) >> 0;
			(pos < 0 || pos >= buf.length) ? $throwRuntimeError("index out of range") : buf[pos] = ((v + 48 >>> 0) << 24 >>> 24);
			v = v1;
		}
		i$1 = pos;
		while (i$1 < 32) {
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
			while (needed > 0) {
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
		while (i$2 >= 0) {
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
		var x, x$1, x$2, x$3, x$4, x$5, x$6, i, x$7, x$8, _lhs, _index;
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
			while (i >= 0) {
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
				_lhs = d.d; _index = i; (_index < 0 || _index >= _lhs.$length) ? $throwRuntimeError("index out of range") : _lhs.$array[_lhs.$offset + _index] = ((_index < 0 || _index >= _lhs.$length) ? $throwRuntimeError("index out of range") : _lhs.$array[_lhs.$offset + _index]) + (1) << 24 >>> 24;
			}
			return true;
		}
		return false;
	};
	extFloat.Ptr.prototype.ShortestDecimal = function(d, lower, upper) {
		var f, x, buf, n, v, v1, x$1, nd, i, x$2, x$3, _tmp, _tmp$1, x$4, x$5, exp10, x$6, x$7, x$8, x$9, shift, integer, x$10, x$11, fraction, x$12, x$13, allowance, x$14, x$15, targetDiff, integerDigits, _tmp$2, _tmp$3, i$1, pow, x$16, i$2, x$17, pow$1, _q, digit, x$18, x$19, x$20, currentDiff, digit$1, multiplier, x$21, x$22, x$23, x$24;
		f = this;
		if ((x = f.mant, (x.$high === 0 && x.$low === 0))) {
			d.nd = 0;
			d.dp = 0;
			d.neg = f.neg;
			return true;
		}
		if ((f.exp === 0) && $equal(lower, f, extFloat) && $equal(lower, upper, extFloat)) {
			buf = ($arrayType($Uint8, 24)).zero(); $copy(buf, ($arrayType($Uint8, 24)).zero(), ($arrayType($Uint8, 24)));
			n = 23;
			v = f.mant;
			while ((v.$high > 0 || (v.$high === 0 && v.$low > 0))) {
				v1 = $div64(v, new $Uint64(0, 10), false);
				v = (x$1 = $mul64(new $Uint64(0, 10), v1), new $Uint64(v.$high - x$1.$high, v.$low - x$1.$low));
				(n < 0 || n >= buf.length) ? $throwRuntimeError("index out of range") : buf[n] = (new $Uint64(v.$high + 0, v.$low + 48).$low << 24 >>> 24);
				n = n - (1) >> 0;
				v = v1;
			}
			nd = (24 - n >> 0) - 1 >> 0;
			i = 0;
			while (i < nd) {
				(x$3 = d.d, (i < 0 || i >= x$3.$length) ? $throwRuntimeError("index out of range") : x$3.$array[x$3.$offset + i] = (x$2 = (n + 1 >> 0) + i >> 0, ((x$2 < 0 || x$2 >= buf.length) ? $throwRuntimeError("index out of range") : buf[x$2])));
				i = i + (1) >> 0;
			}
			_tmp = nd; _tmp$1 = nd; d.nd = _tmp; d.dp = _tmp$1;
			while (d.nd > 0 && ((x$4 = d.d, x$5 = d.nd - 1 >> 0, ((x$5 < 0 || x$5 >= x$4.$length) ? $throwRuntimeError("index out of range") : x$4.$array[x$4.$offset + x$5])) === 48)) {
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
		while (i$1 < 20) {
			if ((x$16 = new $Uint64(0, integer), (pow.$high > x$16.$high || (pow.$high === x$16.$high && pow.$low > x$16.$low)))) {
				integerDigits = i$1;
				break;
			}
			pow = $mul64(pow, (new $Uint64(0, 10)));
			i$1 = i$1 + (1) >> 0;
		}
		i$2 = 0;
		while (i$2 < integerDigits) {
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
		var x, x$1, x$2, x$3, _lhs, _index, x$4, x$5, x$6, x$7, x$8, x$9, x$10;
		if ((x = $mul64(new $Uint64(0, 2), ulpBinary), (ulpDecimal.$high < x.$high || (ulpDecimal.$high === x.$high && ulpDecimal.$low < x.$low)))) {
			return false;
		}
		while ((x$1 = (x$2 = (x$3 = $div64(ulpDecimal, new $Uint64(0, 2), false), new $Uint64(currentDiff.$high + x$3.$high, currentDiff.$low + x$3.$low)), new $Uint64(x$2.$high + ulpBinary.$high, x$2.$low + ulpBinary.$low)), (x$1.$high < targetDiff.$high || (x$1.$high === targetDiff.$high && x$1.$low < targetDiff.$low)))) {
			_lhs = d.d; _index = d.nd - 1 >> 0; (_index < 0 || _index >= _lhs.$length) ? $throwRuntimeError("index out of range") : _lhs.$array[_lhs.$offset + _index] = ((_index < 0 || _index >= _lhs.$length) ? $throwRuntimeError("index out of range") : _lhs.$array[_lhs.$offset + _index]) - (1) << 24 >>> 24;
			currentDiff = (x$4 = ulpDecimal, new $Uint64(currentDiff.$high + x$4.$high, currentDiff.$low + x$4.$low));
		}
		if ((x$5 = new $Uint64(currentDiff.$high + ulpDecimal.$high, currentDiff.$low + ulpDecimal.$low), x$6 = (x$7 = (x$8 = $div64(ulpDecimal, new $Uint64(0, 2), false), new $Uint64(targetDiff.$high + x$8.$high, targetDiff.$low + x$8.$low)), new $Uint64(x$7.$high + ulpBinary.$high, x$7.$low + ulpBinary.$low)), (x$5.$high < x$6.$high || (x$5.$high === x$6.$high && x$5.$low <= x$6.$low)))) {
			return false;
		}
		if ((currentDiff.$high < ulpBinary.$high || (currentDiff.$high === ulpBinary.$high && currentDiff.$low < ulpBinary.$low)) || (x$9 = new $Uint64(maxDiff.$high - ulpBinary.$high, maxDiff.$low - ulpBinary.$low), (currentDiff.$high > x$9.$high || (currentDiff.$high === x$9.$high && currentDiff.$low > x$9.$low)))) {
			return false;
		}
		if ((d.nd === 1) && ((x$10 = d.d, ((0 < 0 || 0 >= x$10.$length) ? $throwRuntimeError("index out of range") : x$10.$array[x$10.$offset + 0])) === 48)) {
			d.nd = 0;
			d.dp = 0;
		}
		return true;
	};
	AppendFloat = $pkg.AppendFloat = function(dst, f, fmt, prec, bitSize) {
		return genericFtoa(dst, f, fmt, prec, bitSize);
	};
	genericFtoa = function(dst, val, fmt, prec, bitSize) {
		var bits, flt, _ref, x, neg, y, exp, x$1, x$2, mant, _ref$1, y$1, s, x$3, digs, ok, shortest, f, _tuple, lower, upper, buf, _ref$2, digits, _ref$3, buf$1, f$1;
		bits = new $Uint64(0, 0);
		flt = ($ptrType(floatInfo)).nil;
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
			return $appendSlice(dst, new ($sliceType($Uint8))($stringToBytes(s)));
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
		digs = new decimalSlice.Ptr(); $copy(digs, new decimalSlice.Ptr(), decimalSlice);
		ok = false;
		shortest = prec < 0;
		if (shortest) {
			f = new extFloat.Ptr();
			_tuple = f.AssignComputeBounds(mant, exp, neg, flt); lower = new extFloat.Ptr(); $copy(lower, _tuple[0], extFloat); upper = new extFloat.Ptr(); $copy(upper, _tuple[1], extFloat);
			buf = ($arrayType($Uint8, 32)).zero(); $copy(buf, ($arrayType($Uint8, 32)).zero(), ($arrayType($Uint8, 32)));
			digs.d = new ($sliceType($Uint8))(buf);
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
				buf$1 = ($arrayType($Uint8, 24)).zero(); $copy(buf$1, ($arrayType($Uint8, 24)).zero(), ($arrayType($Uint8, 24)));
				digs.d = new ($sliceType($Uint8))(buf$1);
				f$1 = new extFloat.Ptr(mant, exp - (flt.mantbits >> 0) >> 0, neg);
				ok = f$1.FixedDecimal(digs, digits);
			}
		}
		if (!ok) {
			return bigFtoa(dst, prec, fmt, neg, mant, exp, flt);
		}
		return formatDigits(dst, shortest, neg, $clone(digs, decimalSlice), prec, fmt);
	};
	bigFtoa = function(dst, prec, fmt, neg, mant, exp, flt) {
		var d, digs, shortest, _ref, _ref$1;
		d = new decimal.Ptr();
		d.Assign(mant);
		d.Shift(exp - (flt.mantbits >> 0) >> 0);
		digs = new decimalSlice.Ptr(); $copy(digs, new decimalSlice.Ptr(), decimalSlice);
		shortest = prec < 0;
		if (shortest) {
			roundShortest(d, mant, exp, flt);
			$copy(digs, new decimalSlice.Ptr(new ($sliceType($Uint8))(d.d), d.nd, d.dp, false), decimalSlice);
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
			$copy(digs, new decimalSlice.Ptr(new ($sliceType($Uint8))(d.d), d.nd, d.dp, false), decimalSlice);
		}
		return formatDigits(dst, shortest, neg, $clone(digs, decimalSlice), prec, fmt);
	};
	formatDigits = function(dst, shortest, neg, digs, prec, fmt) {
		var _ref, eprec, exp;
		_ref = fmt;
		if (_ref === 101 || _ref === 69) {
			return fmtE(dst, neg, $clone(digs, decimalSlice), prec, fmt);
		} else if (_ref === 102) {
			return fmtF(dst, neg, $clone(digs, decimalSlice), prec);
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
				return fmtE(dst, neg, $clone(digs, decimalSlice), prec - 1 >> 0, (fmt + 101 << 24 >>> 24) - 103 << 24 >>> 24);
			}
			if (prec > digs.dp) {
				prec = digs.nd;
			}
			return fmtF(dst, neg, $clone(digs, decimalSlice), max(prec - digs.dp >> 0, 0));
		}
		return $append(dst, 37, fmt);
	};
	roundShortest = function(d, mant, exp, flt) {
		var minexp, x, x$1, upper, x$2, mantlo, explo, x$3, x$4, lower, x$5, x$6, inclusive, i, _tmp, _tmp$1, _tmp$2, l, m, u, x$7, x$8, x$9, okdown, okup;
		if ((mant.$high === 0 && mant.$low === 0)) {
			d.nd = 0;
			return;
		}
		minexp = flt.bias + 1 >> 0;
		if (exp > minexp && (x = (d.dp - d.nd >> 0), (((332 >>> 16 << 16) * x >> 0) + (332 << 16 >>> 16) * x) >> 0) >= (x$1 = (exp - (flt.mantbits >> 0) >> 0), (((100 >>> 16 << 16) * x$1 >> 0) + (100 << 16 >>> 16) * x$1) >> 0)) {
			return;
		}
		upper = new decimal.Ptr();
		upper.Assign((x$2 = $mul64(mant, new $Uint64(0, 2)), new $Uint64(x$2.$high + 0, x$2.$low + 1)));
		upper.Shift((exp - (flt.mantbits >> 0) >> 0) - 1 >> 0);
		mantlo = new $Uint64(0, 0);
		explo = 0;
		if ((x$3 = $shiftLeft64(new $Uint64(0, 1), flt.mantbits), (mant.$high > x$3.$high || (mant.$high === x$3.$high && mant.$low > x$3.$low))) || (exp === minexp)) {
			mantlo = new $Uint64(mant.$high - 0, mant.$low - 1);
			explo = exp;
		} else {
			mantlo = (x$4 = $mul64(mant, new $Uint64(0, 2)), new $Uint64(x$4.$high - 0, x$4.$low - 1));
			explo = exp - 1 >> 0;
		}
		lower = new decimal.Ptr();
		lower.Assign((x$5 = $mul64(mantlo, new $Uint64(0, 2)), new $Uint64(x$5.$high + 0, x$5.$low + 1)));
		lower.Shift((explo - (flt.mantbits >> 0) >> 0) - 1 >> 0);
		inclusive = (x$6 = $div64(mant, new $Uint64(0, 2), true), (x$6.$high === 0 && x$6.$low === 0));
		i = 0;
		while (i < d.nd) {
			_tmp = 0; _tmp$1 = 0; _tmp$2 = 0; l = _tmp; m = _tmp$1; u = _tmp$2;
			if (i < lower.nd) {
				l = (x$7 = lower.d, ((i < 0 || i >= x$7.length) ? $throwRuntimeError("index out of range") : x$7[i]));
			} else {
				l = 48;
			}
			m = (x$8 = d.d, ((i < 0 || i >= x$8.length) ? $throwRuntimeError("index out of range") : x$8[i]));
			if (i < upper.nd) {
				u = (x$9 = upper.d, ((i < 0 || i >= x$9.length) ? $throwRuntimeError("index out of range") : x$9[i]));
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
		var ch, x, i, m, x$1, exp, buf, i$1, _r, _q, _ref;
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
			while (i < m) {
				dst = $append(dst, (x$1 = d.d, ((i < 0 || i >= x$1.$length) ? $throwRuntimeError("index out of range") : x$1.$array[x$1.$offset + i])));
				i = i + (1) >> 0;
			}
			while (i <= prec) {
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
		buf = ($arrayType($Uint8, 3)).zero(); $copy(buf, ($arrayType($Uint8, 3)).zero(), ($arrayType($Uint8, 3)));
		i$1 = 3;
		while (exp >= 10) {
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
		var i, x, i$1, ch, j, x$1;
		if (neg) {
			dst = $append(dst, 45);
		}
		if (d.dp > 0) {
			i = 0;
			i = 0;
			while (i < d.dp && i < d.nd) {
				dst = $append(dst, (x = d.d, ((i < 0 || i >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + i])));
				i = i + (1) >> 0;
			}
			while (i < d.dp) {
				dst = $append(dst, 48);
				i = i + (1) >> 0;
			}
		} else {
			dst = $append(dst, 48);
		}
		if (prec > 0) {
			dst = $append(dst, 46);
			i$1 = 0;
			while (i$1 < prec) {
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
		var buf, w, esign, n, _r, _q, x;
		buf = ($arrayType($Uint8, 50)).zero(); $copy(buf, ($arrayType($Uint8, 50)).zero(), ($arrayType($Uint8, 50)));
		w = 50;
		exp = exp - ((flt.mantbits >> 0)) >> 0;
		esign = 43;
		if (exp < 0) {
			esign = 45;
			exp = -exp;
		}
		n = 0;
		while (exp > 0 || n < 1) {
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
		while ((mant.$high > 0 || (mant.$high === 0 && mant.$low > 0)) || n < 1) {
			n = n + (1) >> 0;
			w = w - (1) >> 0;
			(w < 0 || w >= buf.length) ? $throwRuntimeError("index out of range") : buf[w] = ((x = $div64(mant, new $Uint64(0, 10), true), new $Uint64(x.$high + 0, x.$low + 48)).$low << 24 >>> 24);
			mant = $div64(mant, (new $Uint64(0, 10)), false);
		}
		if (neg) {
			w = w - (1) >> 0;
			(w < 0 || w >= buf.length) ? $throwRuntimeError("index out of range") : buf[w] = 45;
		}
		return $appendSlice(dst, $subslice(new ($sliceType($Uint8))(buf), w));
	};
	max = function(a, b) {
		if (a > b) {
			return a;
		}
		return b;
	};
	FormatInt = $pkg.FormatInt = function(i, base) {
		var _tuple, s;
		_tuple = formatBits(($sliceType($Uint8)).nil, new $Uint64(i.$high, i.$low), base, (i.$high < 0 || (i.$high === 0 && i.$low < 0)), false); s = _tuple[1];
		return s;
	};
	Itoa = $pkg.Itoa = function(i) {
		return FormatInt(new $Int64(0, i), 10);
	};
	formatBits = function(dst, u, base, neg, append_) {
		var d = ($sliceType($Uint8)).nil, s = "", a, i, q, x, j, x$1, x$2, q$1, x$3, s$1, b, m, b$1;
		if (base < 2 || base > 36) {
			$panic(new $String("strconv: illegal AppendInt/FormatInt base"));
		}
		a = ($arrayType($Uint8, 65)).zero(); $copy(a, ($arrayType($Uint8, 65)).zero(), ($arrayType($Uint8, 65)));
		i = 65;
		if (neg) {
			u = new $Uint64(-u.$high, -u.$low);
		}
		if (base === 10) {
			while ((u.$high > 0 || (u.$high === 0 && u.$low >= 100))) {
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
				while ((u.$high > b.$high || (u.$high === b.$high && u.$low >= b.$low))) {
					i = i - (1) >> 0;
					(i < 0 || i >= a.length) ? $throwRuntimeError("index out of range") : a[i] = "0123456789abcdefghijklmnopqrstuvwxyz".charCodeAt((((u.$low >>> 0) & m) >>> 0));
					u = $shiftRightUint64(u, (s$1));
				}
			} else {
				b$1 = new $Uint64(0, base);
				while ((u.$high > b$1.$high || (u.$high === b$1.$high && u.$low >= b$1.$low))) {
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
			d = $appendSlice(dst, $subslice(new ($sliceType($Uint8))(a), i));
			return [d, s];
		}
		s = $bytesToString($subslice(new ($sliceType($Uint8))(a), i));
		return [d, s];
	};
	quoteWith = function(s, quote, ASCIIonly) {
		var runeTmp, _q, x, buf, width, r, _tuple, n, _ref, s$1, s$2;
		runeTmp = ($arrayType($Uint8, 4)).zero(); $copy(runeTmp, ($arrayType($Uint8, 4)).zero(), ($arrayType($Uint8, 4)));
		buf = ($sliceType($Uint8)).make(0, (_q = (x = s.length, (((3 >>> 16 << 16) * x >> 0) + (3 << 16 >>> 16) * x) >> 0) / 2, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero")));
		buf = $append(buf, quote);
		width = 0;
		while (s.length > 0) {
			r = (s.charCodeAt(0) >> 0);
			width = 1;
			if (r >= 128) {
				_tuple = utf8.DecodeRuneInString(s); r = _tuple[0]; width = _tuple[1];
			}
			if ((width === 1) && (r === 65533)) {
				buf = $appendSlice(buf, new ($sliceType($Uint8))($stringToBytes("\\x")));
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
				n = utf8.EncodeRune(new ($sliceType($Uint8))(runeTmp), r);
				buf = $appendSlice(buf, $subslice(new ($sliceType($Uint8))(runeTmp), 0, n));
				s = s.substring(width);
				continue;
			}
			_ref = r;
			if (_ref === 7) {
				buf = $appendSlice(buf, new ($sliceType($Uint8))($stringToBytes("\\a")));
			} else if (_ref === 8) {
				buf = $appendSlice(buf, new ($sliceType($Uint8))($stringToBytes("\\b")));
			} else if (_ref === 12) {
				buf = $appendSlice(buf, new ($sliceType($Uint8))($stringToBytes("\\f")));
			} else if (_ref === 10) {
				buf = $appendSlice(buf, new ($sliceType($Uint8))($stringToBytes("\\n")));
			} else if (_ref === 13) {
				buf = $appendSlice(buf, new ($sliceType($Uint8))($stringToBytes("\\r")));
			} else if (_ref === 9) {
				buf = $appendSlice(buf, new ($sliceType($Uint8))($stringToBytes("\\t")));
			} else if (_ref === 11) {
				buf = $appendSlice(buf, new ($sliceType($Uint8))($stringToBytes("\\v")));
			} else {
				if (r < 32) {
					buf = $appendSlice(buf, new ($sliceType($Uint8))($stringToBytes("\\x")));
					buf = $append(buf, "0123456789abcdef".charCodeAt((s.charCodeAt(0) >>> 4 << 24 >>> 24)));
					buf = $append(buf, "0123456789abcdef".charCodeAt(((s.charCodeAt(0) & 15) >>> 0)));
				} else if (r > 1114111) {
					r = 65533;
					buf = $appendSlice(buf, new ($sliceType($Uint8))($stringToBytes("\\u")));
					s$1 = 12;
					while (s$1 >= 0) {
						buf = $append(buf, "0123456789abcdef".charCodeAt((((r >> $min((s$1 >>> 0), 31)) >> 0) & 15)));
						s$1 = s$1 - (4) >> 0;
					}
				} else if (r < 65536) {
					buf = $appendSlice(buf, new ($sliceType($Uint8))($stringToBytes("\\u")));
					s$1 = 12;
					while (s$1 >= 0) {
						buf = $append(buf, "0123456789abcdef".charCodeAt((((r >> $min((s$1 >>> 0), 31)) >> 0) & 15)));
						s$1 = s$1 - (4) >> 0;
					}
				} else {
					buf = $appendSlice(buf, new ($sliceType($Uint8))($stringToBytes("\\U")));
					s$2 = 28;
					while (s$2 >= 0) {
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
		return quoteWith(s, 34, false);
	};
	QuoteToASCII = $pkg.QuoteToASCII = function(s) {
		return quoteWith(s, 34, true);
	};
	QuoteRune = $pkg.QuoteRune = function(r) {
		return quoteWith($encodeRune(r), 39, false);
	};
	AppendQuoteRune = $pkg.AppendQuoteRune = function(dst, r) {
		return $appendSlice(dst, new ($sliceType($Uint8))($stringToBytes(QuoteRune(r))));
	};
	QuoteRuneToASCII = $pkg.QuoteRuneToASCII = function(r) {
		return quoteWith($encodeRune(r), 39, true);
	};
	AppendQuoteRuneToASCII = $pkg.AppendQuoteRuneToASCII = function(dst, r) {
		return $appendSlice(dst, new ($sliceType($Uint8))($stringToBytes(QuoteRuneToASCII(r))));
	};
	CanBackquote = $pkg.CanBackquote = function(s) {
		var i, c;
		i = 0;
		while (i < s.length) {
			c = s.charCodeAt(i);
			if ((c < 32 && !((c === 9))) || (c === 96) || (c === 127)) {
				return false;
			}
			i = i + (1) >> 0;
		}
		return true;
	};
	unhex = function(b) {
		var v = 0, ok = false, c, _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5;
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
		var value = 0, multibyte = false, tail = "", err = null, c, _tuple, r, size, _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, _tmp$6, _tmp$7, c$1, _ref, n, _ref$1, v, j, _tuple$1, x, ok, v$1, j$1, x$1;
		c = s.charCodeAt(0);
		if ((c === quote) && ((quote === 39) || (quote === 34))) {
			err = $pkg.ErrSyntax;
			return [value, multibyte, tail, err];
		} else if (c >= 128) {
			_tuple = utf8.DecodeRuneInString(s); r = _tuple[0]; size = _tuple[1];
			_tmp = r; _tmp$1 = true; _tmp$2 = s.substring(size); _tmp$3 = null; value = _tmp; multibyte = _tmp$1; tail = _tmp$2; err = _tmp$3;
			return [value, multibyte, tail, err];
		} else if (!((c === 92))) {
			_tmp$4 = (s.charCodeAt(0) >> 0); _tmp$5 = false; _tmp$6 = s.substring(1); _tmp$7 = null; value = _tmp$4; multibyte = _tmp$5; tail = _tmp$6; err = _tmp$7;
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
			while (j < n) {
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
			while (j$1 < 2) {
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
		var t = "", err = null, n, _tmp, _tmp$1, quote, _tmp$2, _tmp$3, _tmp$4, _tmp$5, _tmp$6, _tmp$7, _tmp$8, _tmp$9, _tmp$10, _tmp$11, _ref, _tmp$12, _tmp$13, _tuple, r, size, _tmp$14, _tmp$15, runeTmp, _q, x, buf, _tuple$1, c, multibyte, ss, err$1, _tmp$16, _tmp$17, n$1, _tmp$18, _tmp$19, _tmp$20, _tmp$21;
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
			_tmp$6 = s; _tmp$7 = null; t = _tmp$6; err = _tmp$7;
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
				_tmp$12 = s; _tmp$13 = null; t = _tmp$12; err = _tmp$13;
				return [t, err];
			} else if (_ref === 39) {
				_tuple = utf8.DecodeRuneInString(s); r = _tuple[0]; size = _tuple[1];
				if ((size === s.length) && (!((r === 65533)) || !((size === 1)))) {
					_tmp$14 = s; _tmp$15 = null; t = _tmp$14; err = _tmp$15;
					return [t, err];
				}
			}
		}
		runeTmp = ($arrayType($Uint8, 4)).zero(); $copy(runeTmp, ($arrayType($Uint8, 4)).zero(), ($arrayType($Uint8, 4)));
		buf = ($sliceType($Uint8)).make(0, (_q = (x = s.length, (((3 >>> 16 << 16) * x >> 0) + (3 << 16 >>> 16) * x) >> 0) / 2, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero")));
		while (s.length > 0) {
			_tuple$1 = UnquoteChar(s, quote); c = _tuple$1[0]; multibyte = _tuple$1[1]; ss = _tuple$1[2]; err$1 = _tuple$1[3];
			if (!($interfaceIsEqual(err$1, null))) {
				_tmp$16 = ""; _tmp$17 = err$1; t = _tmp$16; err = _tmp$17;
				return [t, err];
			}
			s = ss;
			if (c < 128 || !multibyte) {
				buf = $append(buf, (c << 24 >>> 24));
			} else {
				n$1 = utf8.EncodeRune(new ($sliceType($Uint8))(runeTmp), c);
				buf = $appendSlice(buf, $subslice(new ($sliceType($Uint8))(runeTmp), 0, n$1));
			}
			if ((quote === 39) && !((s.length === 0))) {
				_tmp$18 = ""; _tmp$19 = $pkg.ErrSyntax; t = _tmp$18; err = _tmp$19;
				return [t, err];
			}
		}
		_tmp$20 = $bytesToString(buf); _tmp$21 = null; t = _tmp$20; err = _tmp$21;
		return [t, err];
	};
	contains = function(s, c) {
		var i;
		i = 0;
		while (i < s.length) {
			if (s.charCodeAt(i) === c) {
				return true;
			}
			i = i + (1) >> 0;
		}
		return false;
	};
	bsearch16 = function(a, x) {
		var _tmp, _tmp$1, i, j, _q, h;
		_tmp = 0; _tmp$1 = a.$length; i = _tmp; j = _tmp$1;
		while (i < j) {
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
		var _tmp, _tmp$1, i, j, _q, h;
		_tmp = 0; _tmp$1 = a.$length; i = _tmp; j = _tmp$1;
		while (i < j) {
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
		var _tmp, _tmp$1, _tmp$2, rr, isPrint, isNotPrint, i, x, x$1, j, _tmp$3, _tmp$4, _tmp$5, rr$1, isPrint$1, isNotPrint$1, i$1, x$2, x$3, j$1;
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
	$pkg.$init = function() {
		($ptrType(decimal)).methods = [["Assign", "Assign", "", [$Uint64], [], false, -1], ["Round", "Round", "", [$Int], [], false, -1], ["RoundDown", "RoundDown", "", [$Int], [], false, -1], ["RoundUp", "RoundUp", "", [$Int], [], false, -1], ["RoundedInteger", "RoundedInteger", "", [], [$Uint64], false, -1], ["Shift", "Shift", "", [$Int], [], false, -1], ["String", "String", "", [], [$String], false, -1], ["floatBits", "floatBits", "strconv", [($ptrType(floatInfo))], [$Uint64, $Bool], false, -1], ["set", "set", "strconv", [$String], [$Bool], false, -1]];
		decimal.init([["d", "d", "strconv", ($arrayType($Uint8, 800)), ""], ["nd", "nd", "strconv", $Int, ""], ["dp", "dp", "strconv", $Int, ""], ["neg", "neg", "strconv", $Bool, ""], ["trunc", "trunc", "strconv", $Bool, ""]]);
		leftCheat.init([["delta", "delta", "strconv", $Int, ""], ["cutoff", "cutoff", "strconv", $String, ""]]);
		($ptrType(extFloat)).methods = [["AssignComputeBounds", "AssignComputeBounds", "", [$Uint64, $Int, $Bool, ($ptrType(floatInfo))], [extFloat, extFloat], false, -1], ["AssignDecimal", "AssignDecimal", "", [$Uint64, $Int, $Bool, $Bool, ($ptrType(floatInfo))], [$Bool], false, -1], ["FixedDecimal", "FixedDecimal", "", [($ptrType(decimalSlice)), $Int], [$Bool], false, -1], ["Multiply", "Multiply", "", [extFloat], [], false, -1], ["Normalize", "Normalize", "", [], [$Uint], false, -1], ["ShortestDecimal", "ShortestDecimal", "", [($ptrType(decimalSlice)), ($ptrType(extFloat)), ($ptrType(extFloat))], [$Bool], false, -1], ["floatBits", "floatBits", "strconv", [($ptrType(floatInfo))], [$Uint64, $Bool], false, -1], ["frexp10", "frexp10", "strconv", [], [$Int, $Int], false, -1]];
		extFloat.init([["mant", "mant", "strconv", $Uint64, ""], ["exp", "exp", "strconv", $Int, ""], ["neg", "neg", "strconv", $Bool, ""]]);
		floatInfo.init([["mantbits", "mantbits", "strconv", $Uint, ""], ["expbits", "expbits", "strconv", $Uint, ""], ["bias", "bias", "strconv", $Int, ""]]);
		decimalSlice.init([["d", "d", "strconv", ($sliceType($Uint8)), ""], ["nd", "nd", "strconv", $Int, ""], ["dp", "dp", "strconv", $Int, ""], ["neg", "neg", "strconv", $Bool, ""]]);
		optimize = true;
		$pkg.ErrRange = errors.New("value out of range");
		$pkg.ErrSyntax = errors.New("invalid syntax");
		leftcheats = new ($sliceType(leftCheat))([new leftCheat.Ptr(0, ""), new leftCheat.Ptr(1, "5"), new leftCheat.Ptr(1, "25"), new leftCheat.Ptr(1, "125"), new leftCheat.Ptr(2, "625"), new leftCheat.Ptr(2, "3125"), new leftCheat.Ptr(2, "15625"), new leftCheat.Ptr(3, "78125"), new leftCheat.Ptr(3, "390625"), new leftCheat.Ptr(3, "1953125"), new leftCheat.Ptr(4, "9765625"), new leftCheat.Ptr(4, "48828125"), new leftCheat.Ptr(4, "244140625"), new leftCheat.Ptr(4, "1220703125"), new leftCheat.Ptr(5, "6103515625"), new leftCheat.Ptr(5, "30517578125"), new leftCheat.Ptr(5, "152587890625"), new leftCheat.Ptr(6, "762939453125"), new leftCheat.Ptr(6, "3814697265625"), new leftCheat.Ptr(6, "19073486328125"), new leftCheat.Ptr(7, "95367431640625"), new leftCheat.Ptr(7, "476837158203125"), new leftCheat.Ptr(7, "2384185791015625"), new leftCheat.Ptr(7, "11920928955078125"), new leftCheat.Ptr(8, "59604644775390625"), new leftCheat.Ptr(8, "298023223876953125"), new leftCheat.Ptr(8, "1490116119384765625"), new leftCheat.Ptr(9, "7450580596923828125")]);
		smallPowersOfTen = $toNativeArray("Struct", [new extFloat.Ptr(new $Uint64(2147483648, 0), -63, false), new extFloat.Ptr(new $Uint64(2684354560, 0), -60, false), new extFloat.Ptr(new $Uint64(3355443200, 0), -57, false), new extFloat.Ptr(new $Uint64(4194304000, 0), -54, false), new extFloat.Ptr(new $Uint64(2621440000, 0), -50, false), new extFloat.Ptr(new $Uint64(3276800000, 0), -47, false), new extFloat.Ptr(new $Uint64(4096000000, 0), -44, false), new extFloat.Ptr(new $Uint64(2560000000, 0), -40, false)]);
		powersOfTen = $toNativeArray("Struct", [new extFloat.Ptr(new $Uint64(4203730336, 136053384), -1220, false), new extFloat.Ptr(new $Uint64(3132023167, 2722021238), -1193, false), new extFloat.Ptr(new $Uint64(2333539104, 810921078), -1166, false), new extFloat.Ptr(new $Uint64(3477244234, 1573795306), -1140, false), new extFloat.Ptr(new $Uint64(2590748842, 1432697645), -1113, false), new extFloat.Ptr(new $Uint64(3860516611, 1025131999), -1087, false), new extFloat.Ptr(new $Uint64(2876309015, 3348809418), -1060, false), new extFloat.Ptr(new $Uint64(4286034428, 3200048207), -1034, false), new extFloat.Ptr(new $Uint64(3193344495, 1097586188), -1007, false), new extFloat.Ptr(new $Uint64(2379227053, 2424306748), -980, false), new extFloat.Ptr(new $Uint64(3545324584, 827693699), -954, false), new extFloat.Ptr(new $Uint64(2641472655, 2913388981), -927, false), new extFloat.Ptr(new $Uint64(3936100983, 602835915), -901, false), new extFloat.Ptr(new $Uint64(2932623761, 1081627501), -874, false), new extFloat.Ptr(new $Uint64(2184974969, 1572261463), -847, false), new extFloat.Ptr(new $Uint64(3255866422, 1308317239), -821, false), new extFloat.Ptr(new $Uint64(2425809519, 944281679), -794, false), new extFloat.Ptr(new $Uint64(3614737867, 629291719), -768, false), new extFloat.Ptr(new $Uint64(2693189581, 2545915892), -741, false), new extFloat.Ptr(new $Uint64(4013165208, 388672741), -715, false), new extFloat.Ptr(new $Uint64(2990041083, 708162190), -688, false), new extFloat.Ptr(new $Uint64(2227754207, 3536207675), -661, false), new extFloat.Ptr(new $Uint64(3319612455, 450088378), -635, false), new extFloat.Ptr(new $Uint64(2473304014, 3139815830), -608, false), new extFloat.Ptr(new $Uint64(3685510180, 2103616900), -582, false), new extFloat.Ptr(new $Uint64(2745919064, 224385782), -555, false), new extFloat.Ptr(new $Uint64(4091738259, 3737383206), -529, false), new extFloat.Ptr(new $Uint64(3048582568, 2868871352), -502, false), new extFloat.Ptr(new $Uint64(2271371013, 1820084875), -475, false), new extFloat.Ptr(new $Uint64(3384606560, 885076051), -449, false), new extFloat.Ptr(new $Uint64(2521728396, 2444895829), -422, false), new extFloat.Ptr(new $Uint64(3757668132, 1881767613), -396, false), new extFloat.Ptr(new $Uint64(2799680927, 3102062735), -369, false), new extFloat.Ptr(new $Uint64(4171849679, 2289335700), -343, false), new extFloat.Ptr(new $Uint64(3108270227, 2410191823), -316, false), new extFloat.Ptr(new $Uint64(2315841784, 3205436779), -289, false), new extFloat.Ptr(new $Uint64(3450873173, 1697722806), -263, false), new extFloat.Ptr(new $Uint64(2571100870, 3497754540), -236, false), new extFloat.Ptr(new $Uint64(3831238852, 707476230), -210, false), new extFloat.Ptr(new $Uint64(2854495385, 1769181907), -183, false), new extFloat.Ptr(new $Uint64(4253529586, 2197867022), -157, false), new extFloat.Ptr(new $Uint64(3169126500, 2450594539), -130, false), new extFloat.Ptr(new $Uint64(2361183241, 1867548876), -103, false), new extFloat.Ptr(new $Uint64(3518437208, 3793315116), -77, false), new extFloat.Ptr(new $Uint64(2621440000, 0), -50, false), new extFloat.Ptr(new $Uint64(3906250000, 0), -24, false), new extFloat.Ptr(new $Uint64(2910383045, 2892103680), 3, false), new extFloat.Ptr(new $Uint64(2168404344, 4170451332), 30, false), new extFloat.Ptr(new $Uint64(3231174267, 3372684723), 56, false), new extFloat.Ptr(new $Uint64(2407412430, 2078956656), 83, false), new extFloat.Ptr(new $Uint64(3587324068, 2884206696), 109, false), new extFloat.Ptr(new $Uint64(2672764710, 395977285), 136, false), new extFloat.Ptr(new $Uint64(3982729777, 3569679143), 162, false), new extFloat.Ptr(new $Uint64(2967364920, 2361961896), 189, false), new extFloat.Ptr(new $Uint64(2210859150, 447440347), 216, false), new extFloat.Ptr(new $Uint64(3294436857, 1114709402), 242, false), new extFloat.Ptr(new $Uint64(2454546732, 2786846552), 269, false), new extFloat.Ptr(new $Uint64(3657559652, 443583978), 295, false), new extFloat.Ptr(new $Uint64(2725094297, 2599384906), 322, false), new extFloat.Ptr(new $Uint64(4060706939, 3028118405), 348, false), new extFloat.Ptr(new $Uint64(3025462433, 2044532855), 375, false), new extFloat.Ptr(new $Uint64(2254145170, 1536935362), 402, false), new extFloat.Ptr(new $Uint64(3358938053, 3365297469), 428, false), new extFloat.Ptr(new $Uint64(2502603868, 4204241075), 455, false), new extFloat.Ptr(new $Uint64(3729170365, 2577424355), 481, false), new extFloat.Ptr(new $Uint64(2778448436, 3677981733), 508, false), new extFloat.Ptr(new $Uint64(4140210802, 2744688476), 534, false), new extFloat.Ptr(new $Uint64(3084697427, 1424604878), 561, false), new extFloat.Ptr(new $Uint64(2298278679, 4062331362), 588, false), new extFloat.Ptr(new $Uint64(3424702107, 3546052773), 614, false), new extFloat.Ptr(new $Uint64(2551601907, 2065781727), 641, false), new extFloat.Ptr(new $Uint64(3802183132, 2535403578), 667, false), new extFloat.Ptr(new $Uint64(2832847187, 1558426518), 694, false), new extFloat.Ptr(new $Uint64(4221271257, 2762425404), 720, false), new extFloat.Ptr(new $Uint64(3145092172, 2812560400), 747, false), new extFloat.Ptr(new $Uint64(2343276271, 3057687578), 774, false), new extFloat.Ptr(new $Uint64(3491753744, 2790753324), 800, false), new extFloat.Ptr(new $Uint64(2601559269, 3918606633), 827, false), new extFloat.Ptr(new $Uint64(3876625403, 2711358621), 853, false), new extFloat.Ptr(new $Uint64(2888311001, 1648096297), 880, false), new extFloat.Ptr(new $Uint64(2151959390, 2057817989), 907, false), new extFloat.Ptr(new $Uint64(3206669376, 61660461), 933, false), new extFloat.Ptr(new $Uint64(2389154863, 1581580175), 960, false), new extFloat.Ptr(new $Uint64(3560118173, 2626467905), 986, false), new extFloat.Ptr(new $Uint64(2652494738, 3034782633), 1013, false), new extFloat.Ptr(new $Uint64(3952525166, 3135207385), 1039, false), new extFloat.Ptr(new $Uint64(2944860731, 2616258155), 1066, false)]);
		uint64pow10 = $toNativeArray("Uint64", [new $Uint64(0, 1), new $Uint64(0, 10), new $Uint64(0, 100), new $Uint64(0, 1000), new $Uint64(0, 10000), new $Uint64(0, 100000), new $Uint64(0, 1000000), new $Uint64(0, 10000000), new $Uint64(0, 100000000), new $Uint64(0, 1000000000), new $Uint64(2, 1410065408), new $Uint64(23, 1215752192), new $Uint64(232, 3567587328), new $Uint64(2328, 1316134912), new $Uint64(23283, 276447232), new $Uint64(232830, 2764472320), new $Uint64(2328306, 1874919424), new $Uint64(23283064, 1569325056), new $Uint64(232830643, 2808348672), new $Uint64(2328306436, 2313682944)]);
		float32info = new floatInfo.Ptr(23, 8, -127);
		float64info = new floatInfo.Ptr(52, 11, -1023);
		isPrint16 = new ($sliceType($Uint16))([32, 126, 161, 887, 890, 894, 900, 1319, 1329, 1366, 1369, 1418, 1423, 1479, 1488, 1514, 1520, 1524, 1542, 1563, 1566, 1805, 1808, 1866, 1869, 1969, 1984, 2042, 2048, 2093, 2096, 2139, 2142, 2142, 2208, 2220, 2276, 2444, 2447, 2448, 2451, 2482, 2486, 2489, 2492, 2500, 2503, 2504, 2507, 2510, 2519, 2519, 2524, 2531, 2534, 2555, 2561, 2570, 2575, 2576, 2579, 2617, 2620, 2626, 2631, 2632, 2635, 2637, 2641, 2641, 2649, 2654, 2662, 2677, 2689, 2745, 2748, 2765, 2768, 2768, 2784, 2787, 2790, 2801, 2817, 2828, 2831, 2832, 2835, 2873, 2876, 2884, 2887, 2888, 2891, 2893, 2902, 2903, 2908, 2915, 2918, 2935, 2946, 2954, 2958, 2965, 2969, 2975, 2979, 2980, 2984, 2986, 2990, 3001, 3006, 3010, 3014, 3021, 3024, 3024, 3031, 3031, 3046, 3066, 3073, 3129, 3133, 3149, 3157, 3161, 3168, 3171, 3174, 3183, 3192, 3199, 3202, 3257, 3260, 3277, 3285, 3286, 3294, 3299, 3302, 3314, 3330, 3386, 3389, 3406, 3415, 3415, 3424, 3427, 3430, 3445, 3449, 3455, 3458, 3478, 3482, 3517, 3520, 3526, 3530, 3530, 3535, 3551, 3570, 3572, 3585, 3642, 3647, 3675, 3713, 3716, 3719, 3722, 3725, 3725, 3732, 3751, 3754, 3773, 3776, 3789, 3792, 3801, 3804, 3807, 3840, 3948, 3953, 4058, 4096, 4295, 4301, 4301, 4304, 4685, 4688, 4701, 4704, 4749, 4752, 4789, 4792, 4805, 4808, 4885, 4888, 4954, 4957, 4988, 4992, 5017, 5024, 5108, 5120, 5788, 5792, 5872, 5888, 5908, 5920, 5942, 5952, 5971, 5984, 6003, 6016, 6109, 6112, 6121, 6128, 6137, 6144, 6157, 6160, 6169, 6176, 6263, 6272, 6314, 6320, 6389, 6400, 6428, 6432, 6443, 6448, 6459, 6464, 6464, 6468, 6509, 6512, 6516, 6528, 6571, 6576, 6601, 6608, 6618, 6622, 6683, 6686, 6780, 6783, 6793, 6800, 6809, 6816, 6829, 6912, 6987, 6992, 7036, 7040, 7155, 7164, 7223, 7227, 7241, 7245, 7295, 7360, 7367, 7376, 7414, 7424, 7654, 7676, 7957, 7960, 7965, 7968, 8005, 8008, 8013, 8016, 8061, 8064, 8147, 8150, 8175, 8178, 8190, 8208, 8231, 8240, 8286, 8304, 8305, 8308, 8348, 8352, 8378, 8400, 8432, 8448, 8585, 8592, 9203, 9216, 9254, 9280, 9290, 9312, 11084, 11088, 11097, 11264, 11507, 11513, 11559, 11565, 11565, 11568, 11623, 11631, 11632, 11647, 11670, 11680, 11835, 11904, 12019, 12032, 12245, 12272, 12283, 12289, 12438, 12441, 12543, 12549, 12589, 12593, 12730, 12736, 12771, 12784, 19893, 19904, 40908, 40960, 42124, 42128, 42182, 42192, 42539, 42560, 42647, 42655, 42743, 42752, 42899, 42912, 42922, 43000, 43051, 43056, 43065, 43072, 43127, 43136, 43204, 43214, 43225, 43232, 43259, 43264, 43347, 43359, 43388, 43392, 43481, 43486, 43487, 43520, 43574, 43584, 43597, 43600, 43609, 43612, 43643, 43648, 43714, 43739, 43766, 43777, 43782, 43785, 43790, 43793, 43798, 43808, 43822, 43968, 44013, 44016, 44025, 44032, 55203, 55216, 55238, 55243, 55291, 63744, 64109, 64112, 64217, 64256, 64262, 64275, 64279, 64285, 64449, 64467, 64831, 64848, 64911, 64914, 64967, 65008, 65021, 65024, 65049, 65056, 65062, 65072, 65131, 65136, 65276, 65281, 65470, 65474, 65479, 65482, 65487, 65490, 65495, 65498, 65500, 65504, 65518, 65532, 65533]);
		isNotPrint16 = new ($sliceType($Uint16))([173, 907, 909, 930, 1376, 1416, 1424, 1757, 2111, 2209, 2303, 2424, 2432, 2436, 2473, 2481, 2526, 2564, 2601, 2609, 2612, 2615, 2621, 2653, 2692, 2702, 2706, 2729, 2737, 2740, 2758, 2762, 2820, 2857, 2865, 2868, 2910, 2948, 2961, 2971, 2973, 3017, 3076, 3085, 3089, 3113, 3124, 3141, 3145, 3159, 3204, 3213, 3217, 3241, 3252, 3269, 3273, 3295, 3312, 3332, 3341, 3345, 3397, 3401, 3460, 3506, 3516, 3541, 3543, 3715, 3721, 3736, 3744, 3748, 3750, 3756, 3770, 3781, 3783, 3912, 3992, 4029, 4045, 4294, 4681, 4695, 4697, 4745, 4785, 4799, 4801, 4823, 4881, 5760, 5901, 5997, 6001, 6751, 8024, 8026, 8028, 8030, 8117, 8133, 8156, 8181, 8335, 9984, 11311, 11359, 11558, 11687, 11695, 11703, 11711, 11719, 11727, 11735, 11743, 11930, 12352, 12687, 12831, 13055, 42895, 43470, 43815, 64311, 64317, 64319, 64322, 64325, 65107, 65127, 65141, 65511]);
		isPrint32 = new ($sliceType($Uint32))([65536, 65613, 65616, 65629, 65664, 65786, 65792, 65794, 65799, 65843, 65847, 65930, 65936, 65947, 66000, 66045, 66176, 66204, 66208, 66256, 66304, 66339, 66352, 66378, 66432, 66499, 66504, 66517, 66560, 66717, 66720, 66729, 67584, 67589, 67592, 67640, 67644, 67644, 67647, 67679, 67840, 67867, 67871, 67897, 67903, 67903, 67968, 68023, 68030, 68031, 68096, 68102, 68108, 68147, 68152, 68154, 68159, 68167, 68176, 68184, 68192, 68223, 68352, 68405, 68409, 68437, 68440, 68466, 68472, 68479, 68608, 68680, 69216, 69246, 69632, 69709, 69714, 69743, 69760, 69825, 69840, 69864, 69872, 69881, 69888, 69955, 70016, 70088, 70096, 70105, 71296, 71351, 71360, 71369, 73728, 74606, 74752, 74850, 74864, 74867, 77824, 78894, 92160, 92728, 93952, 94020, 94032, 94078, 94095, 94111, 110592, 110593, 118784, 119029, 119040, 119078, 119081, 119154, 119163, 119261, 119296, 119365, 119552, 119638, 119648, 119665, 119808, 119967, 119970, 119970, 119973, 119974, 119977, 120074, 120077, 120134, 120138, 120485, 120488, 120779, 120782, 120831, 126464, 126500, 126503, 126523, 126530, 126530, 126535, 126548, 126551, 126564, 126567, 126619, 126625, 126651, 126704, 126705, 126976, 127019, 127024, 127123, 127136, 127150, 127153, 127166, 127169, 127199, 127232, 127242, 127248, 127339, 127344, 127386, 127462, 127490, 127504, 127546, 127552, 127560, 127568, 127569, 127744, 127776, 127792, 127868, 127872, 127891, 127904, 127946, 127968, 127984, 128000, 128252, 128256, 128317, 128320, 128323, 128336, 128359, 128507, 128576, 128581, 128591, 128640, 128709, 128768, 128883, 131072, 173782, 173824, 177972, 177984, 178205, 194560, 195101, 917760, 917999]);
		isNotPrint32 = new ($sliceType($Uint16))([12, 39, 59, 62, 799, 926, 2057, 2102, 2134, 2564, 2580, 2584, 4285, 4405, 54357, 54429, 54445, 54458, 54460, 54468, 54534, 54549, 54557, 54586, 54591, 54597, 54609, 60932, 60960, 60963, 60968, 60979, 60984, 60986, 61000, 61002, 61004, 61008, 61011, 61016, 61018, 61020, 61022, 61024, 61027, 61035, 61043, 61048, 61053, 61055, 61066, 61092, 61098, 61648, 61743, 62262, 62405, 62527, 62529, 62712]);
		shifts = $toNativeArray("Uint", [0, 0, 1, 0, 2, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 0]);
	};
	return $pkg;
})();
$packages["reflect"] = (function() {
	var $pkg = {}, js = $packages["github.com/gopherjs/gopherjs/js"], runtime = $packages["runtime"], strconv = $packages["strconv"], sync = $packages["sync"], math = $packages["math"], mapIter, Type, Kind, rtype, method, uncommonType, ChanDir, arrayType, chanType, funcType, imethod, interfaceType, mapType, ptrType, sliceType, structField, structType, Method, StructField, StructTag, fieldScan, Value, flag, ValueError, iword, nonEmptyInterface, initialized, kindNames, uint8Type, x, init, jsType, reflectType, isWrapped, copyStruct, makeValue, MakeSlice, jsObject, TypeOf, ValueOf, SliceOf, Zero, unsafe_New, makeInt, memmove, loadScalar, chanclose, chanrecv, chansend, mapaccess, mapassign, mapdelete, mapiterinit, mapiterkey, mapiternext, maplen, cvtDirect, methodReceiver, valueInterface, ifaceE2I, methodName, makeMethodValue, PtrTo, implements$1, directlyAssignable, haveIdenticalUnderlyingType, toType, overflowFloat32, New, convertOp, makeFloat, makeComplex, makeString, makeBytes, makeRunes, cvtInt, cvtUint, cvtFloatInt, cvtFloatUint, cvtIntFloat, cvtUintFloat, cvtFloat, cvtComplex, cvtIntString, cvtUintString, cvtBytesString, cvtStringBytes, cvtRunesString, cvtStringRunes, cvtT2I, cvtI2I, call;
	mapIter = $pkg.mapIter = $newType(0, "Struct", "reflect.mapIter", "mapIter", "reflect", function(t_, m_, keys_, i_) {
		this.$val = this;
		this.t = t_ !== undefined ? t_ : null;
		this.m = m_ !== undefined ? m_ : null;
		this.keys = keys_ !== undefined ? keys_ : null;
		this.i = i_ !== undefined ? i_ : 0;
	});
	Type = $pkg.Type = $newType(8, "Interface", "reflect.Type", "Type", "reflect", null);
	Kind = $pkg.Kind = $newType(4, "Uint", "reflect.Kind", "Kind", "reflect", null);
	rtype = $pkg.rtype = $newType(0, "Struct", "reflect.rtype", "rtype", "reflect", function(size_, hash_, _$2_, align_, fieldAlign_, kind_, alg_, gc_, string_, uncommonType_, ptrToThis_, zero_) {
		this.$val = this;
		this.size = size_ !== undefined ? size_ : 0;
		this.hash = hash_ !== undefined ? hash_ : 0;
		this._$2 = _$2_ !== undefined ? _$2_ : 0;
		this.align = align_ !== undefined ? align_ : 0;
		this.fieldAlign = fieldAlign_ !== undefined ? fieldAlign_ : 0;
		this.kind = kind_ !== undefined ? kind_ : 0;
		this.alg = alg_ !== undefined ? alg_ : ($ptrType($Uintptr)).nil;
		this.gc = gc_ !== undefined ? gc_ : 0;
		this.string = string_ !== undefined ? string_ : ($ptrType($String)).nil;
		this.uncommonType = uncommonType_ !== undefined ? uncommonType_ : ($ptrType(uncommonType)).nil;
		this.ptrToThis = ptrToThis_ !== undefined ? ptrToThis_ : ($ptrType(rtype)).nil;
		this.zero = zero_ !== undefined ? zero_ : 0;
	});
	method = $pkg.method = $newType(0, "Struct", "reflect.method", "method", "reflect", function(name_, pkgPath_, mtyp_, typ_, ifn_, tfn_) {
		this.$val = this;
		this.name = name_ !== undefined ? name_ : ($ptrType($String)).nil;
		this.pkgPath = pkgPath_ !== undefined ? pkgPath_ : ($ptrType($String)).nil;
		this.mtyp = mtyp_ !== undefined ? mtyp_ : ($ptrType(rtype)).nil;
		this.typ = typ_ !== undefined ? typ_ : ($ptrType(rtype)).nil;
		this.ifn = ifn_ !== undefined ? ifn_ : 0;
		this.tfn = tfn_ !== undefined ? tfn_ : 0;
	});
	uncommonType = $pkg.uncommonType = $newType(0, "Struct", "reflect.uncommonType", "uncommonType", "reflect", function(name_, pkgPath_, methods_) {
		this.$val = this;
		this.name = name_ !== undefined ? name_ : ($ptrType($String)).nil;
		this.pkgPath = pkgPath_ !== undefined ? pkgPath_ : ($ptrType($String)).nil;
		this.methods = methods_ !== undefined ? methods_ : ($sliceType(method)).nil;
	});
	ChanDir = $pkg.ChanDir = $newType(4, "Int", "reflect.ChanDir", "ChanDir", "reflect", null);
	arrayType = $pkg.arrayType = $newType(0, "Struct", "reflect.arrayType", "arrayType", "reflect", function(rtype_, elem_, slice_, len_) {
		this.$val = this;
		this.rtype = rtype_ !== undefined ? rtype_ : new rtype.Ptr();
		this.elem = elem_ !== undefined ? elem_ : ($ptrType(rtype)).nil;
		this.slice = slice_ !== undefined ? slice_ : ($ptrType(rtype)).nil;
		this.len = len_ !== undefined ? len_ : 0;
	});
	chanType = $pkg.chanType = $newType(0, "Struct", "reflect.chanType", "chanType", "reflect", function(rtype_, elem_, dir_) {
		this.$val = this;
		this.rtype = rtype_ !== undefined ? rtype_ : new rtype.Ptr();
		this.elem = elem_ !== undefined ? elem_ : ($ptrType(rtype)).nil;
		this.dir = dir_ !== undefined ? dir_ : 0;
	});
	funcType = $pkg.funcType = $newType(0, "Struct", "reflect.funcType", "funcType", "reflect", function(rtype_, dotdotdot_, in$2_, out_) {
		this.$val = this;
		this.rtype = rtype_ !== undefined ? rtype_ : new rtype.Ptr();
		this.dotdotdot = dotdotdot_ !== undefined ? dotdotdot_ : false;
		this.in$2 = in$2_ !== undefined ? in$2_ : ($sliceType(($ptrType(rtype)))).nil;
		this.out = out_ !== undefined ? out_ : ($sliceType(($ptrType(rtype)))).nil;
	});
	imethod = $pkg.imethod = $newType(0, "Struct", "reflect.imethod", "imethod", "reflect", function(name_, pkgPath_, typ_) {
		this.$val = this;
		this.name = name_ !== undefined ? name_ : ($ptrType($String)).nil;
		this.pkgPath = pkgPath_ !== undefined ? pkgPath_ : ($ptrType($String)).nil;
		this.typ = typ_ !== undefined ? typ_ : ($ptrType(rtype)).nil;
	});
	interfaceType = $pkg.interfaceType = $newType(0, "Struct", "reflect.interfaceType", "interfaceType", "reflect", function(rtype_, methods_) {
		this.$val = this;
		this.rtype = rtype_ !== undefined ? rtype_ : new rtype.Ptr();
		this.methods = methods_ !== undefined ? methods_ : ($sliceType(imethod)).nil;
	});
	mapType = $pkg.mapType = $newType(0, "Struct", "reflect.mapType", "mapType", "reflect", function(rtype_, key_, elem_, bucket_, hmap_) {
		this.$val = this;
		this.rtype = rtype_ !== undefined ? rtype_ : new rtype.Ptr();
		this.key = key_ !== undefined ? key_ : ($ptrType(rtype)).nil;
		this.elem = elem_ !== undefined ? elem_ : ($ptrType(rtype)).nil;
		this.bucket = bucket_ !== undefined ? bucket_ : ($ptrType(rtype)).nil;
		this.hmap = hmap_ !== undefined ? hmap_ : ($ptrType(rtype)).nil;
	});
	ptrType = $pkg.ptrType = $newType(0, "Struct", "reflect.ptrType", "ptrType", "reflect", function(rtype_, elem_) {
		this.$val = this;
		this.rtype = rtype_ !== undefined ? rtype_ : new rtype.Ptr();
		this.elem = elem_ !== undefined ? elem_ : ($ptrType(rtype)).nil;
	});
	sliceType = $pkg.sliceType = $newType(0, "Struct", "reflect.sliceType", "sliceType", "reflect", function(rtype_, elem_) {
		this.$val = this;
		this.rtype = rtype_ !== undefined ? rtype_ : new rtype.Ptr();
		this.elem = elem_ !== undefined ? elem_ : ($ptrType(rtype)).nil;
	});
	structField = $pkg.structField = $newType(0, "Struct", "reflect.structField", "structField", "reflect", function(name_, pkgPath_, typ_, tag_, offset_) {
		this.$val = this;
		this.name = name_ !== undefined ? name_ : ($ptrType($String)).nil;
		this.pkgPath = pkgPath_ !== undefined ? pkgPath_ : ($ptrType($String)).nil;
		this.typ = typ_ !== undefined ? typ_ : ($ptrType(rtype)).nil;
		this.tag = tag_ !== undefined ? tag_ : ($ptrType($String)).nil;
		this.offset = offset_ !== undefined ? offset_ : 0;
	});
	structType = $pkg.structType = $newType(0, "Struct", "reflect.structType", "structType", "reflect", function(rtype_, fields_) {
		this.$val = this;
		this.rtype = rtype_ !== undefined ? rtype_ : new rtype.Ptr();
		this.fields = fields_ !== undefined ? fields_ : ($sliceType(structField)).nil;
	});
	Method = $pkg.Method = $newType(0, "Struct", "reflect.Method", "Method", "reflect", function(Name_, PkgPath_, Type_, Func_, Index_) {
		this.$val = this;
		this.Name = Name_ !== undefined ? Name_ : "";
		this.PkgPath = PkgPath_ !== undefined ? PkgPath_ : "";
		this.Type = Type_ !== undefined ? Type_ : null;
		this.Func = Func_ !== undefined ? Func_ : new Value.Ptr();
		this.Index = Index_ !== undefined ? Index_ : 0;
	});
	StructField = $pkg.StructField = $newType(0, "Struct", "reflect.StructField", "StructField", "reflect", function(Name_, PkgPath_, Type_, Tag_, Offset_, Index_, Anonymous_) {
		this.$val = this;
		this.Name = Name_ !== undefined ? Name_ : "";
		this.PkgPath = PkgPath_ !== undefined ? PkgPath_ : "";
		this.Type = Type_ !== undefined ? Type_ : null;
		this.Tag = Tag_ !== undefined ? Tag_ : "";
		this.Offset = Offset_ !== undefined ? Offset_ : 0;
		this.Index = Index_ !== undefined ? Index_ : ($sliceType($Int)).nil;
		this.Anonymous = Anonymous_ !== undefined ? Anonymous_ : false;
	});
	StructTag = $pkg.StructTag = $newType(8, "String", "reflect.StructTag", "StructTag", "reflect", null);
	fieldScan = $pkg.fieldScan = $newType(0, "Struct", "reflect.fieldScan", "fieldScan", "reflect", function(typ_, index_) {
		this.$val = this;
		this.typ = typ_ !== undefined ? typ_ : ($ptrType(structType)).nil;
		this.index = index_ !== undefined ? index_ : ($sliceType($Int)).nil;
	});
	Value = $pkg.Value = $newType(0, "Struct", "reflect.Value", "Value", "reflect", function(typ_, ptr_, scalar_, flag_) {
		this.$val = this;
		this.typ = typ_ !== undefined ? typ_ : ($ptrType(rtype)).nil;
		this.ptr = ptr_ !== undefined ? ptr_ : 0;
		this.scalar = scalar_ !== undefined ? scalar_ : 0;
		this.flag = flag_ !== undefined ? flag_ : 0;
	});
	flag = $pkg.flag = $newType(4, "Uintptr", "reflect.flag", "flag", "reflect", null);
	ValueError = $pkg.ValueError = $newType(0, "Struct", "reflect.ValueError", "ValueError", "reflect", function(Method_, Kind_) {
		this.$val = this;
		this.Method = Method_ !== undefined ? Method_ : "";
		this.Kind = Kind_ !== undefined ? Kind_ : 0;
	});
	iword = $pkg.iword = $newType(4, "UnsafePointer", "reflect.iword", "iword", "reflect", null);
	nonEmptyInterface = $pkg.nonEmptyInterface = $newType(0, "Struct", "reflect.nonEmptyInterface", "nonEmptyInterface", "reflect", function(itab_, word_) {
		this.$val = this;
		this.itab = itab_ !== undefined ? itab_ : ($ptrType(($structType([["ityp", "ityp", "reflect", ($ptrType(rtype)), ""], ["typ", "typ", "reflect", ($ptrType(rtype)), ""], ["link", "link", "reflect", $UnsafePointer, ""], ["bad", "bad", "reflect", $Int32, ""], ["unused", "unused", "reflect", $Int32, ""], ["fun", "fun", "reflect", ($arrayType($UnsafePointer, 100000)), ""]])))).nil;
		this.word = word_ !== undefined ? word_ : 0;
	});
	init = function() {
		var used, x$1, x$2, x$3, x$4, x$5, x$6, x$7, x$8, x$9, x$10, x$11, x$12, x$13, pkg, _map, _key, x$14;
		used = (function(i) {
		});
		used((x$1 = new rtype.Ptr(0, 0, 0, 0, 0, 0, ($ptrType($Uintptr)).nil, 0, ($ptrType($String)).nil, ($ptrType(uncommonType)).nil, ($ptrType(rtype)).nil, 0), new x$1.constructor.Struct(x$1)));
		used((x$2 = new uncommonType.Ptr(($ptrType($String)).nil, ($ptrType($String)).nil, ($sliceType(method)).nil), new x$2.constructor.Struct(x$2)));
		used((x$3 = new method.Ptr(($ptrType($String)).nil, ($ptrType($String)).nil, ($ptrType(rtype)).nil, ($ptrType(rtype)).nil, 0, 0), new x$3.constructor.Struct(x$3)));
		used((x$4 = new arrayType.Ptr(new rtype.Ptr(), ($ptrType(rtype)).nil, ($ptrType(rtype)).nil, 0), new x$4.constructor.Struct(x$4)));
		used((x$5 = new chanType.Ptr(new rtype.Ptr(), ($ptrType(rtype)).nil, 0), new x$5.constructor.Struct(x$5)));
		used((x$6 = new funcType.Ptr(new rtype.Ptr(), false, ($sliceType(($ptrType(rtype)))).nil, ($sliceType(($ptrType(rtype)))).nil), new x$6.constructor.Struct(x$6)));
		used((x$7 = new interfaceType.Ptr(new rtype.Ptr(), ($sliceType(imethod)).nil), new x$7.constructor.Struct(x$7)));
		used((x$8 = new mapType.Ptr(new rtype.Ptr(), ($ptrType(rtype)).nil, ($ptrType(rtype)).nil, ($ptrType(rtype)).nil, ($ptrType(rtype)).nil), new x$8.constructor.Struct(x$8)));
		used((x$9 = new ptrType.Ptr(new rtype.Ptr(), ($ptrType(rtype)).nil), new x$9.constructor.Struct(x$9)));
		used((x$10 = new sliceType.Ptr(new rtype.Ptr(), ($ptrType(rtype)).nil), new x$10.constructor.Struct(x$10)));
		used((x$11 = new structType.Ptr(new rtype.Ptr(), ($sliceType(structField)).nil), new x$11.constructor.Struct(x$11)));
		used((x$12 = new imethod.Ptr(($ptrType($String)).nil, ($ptrType($String)).nil, ($ptrType(rtype)).nil), new x$12.constructor.Struct(x$12)));
		used((x$13 = new structField.Ptr(($ptrType($String)).nil, ($ptrType($String)).nil, ($ptrType(rtype)).nil, ($ptrType($String)).nil, 0), new x$13.constructor.Struct(x$13)));
		pkg = $pkg;
		pkg.kinds = $externalize((_map = new $Map(), _key = "Bool", _map[_key] = { k: _key, v: 1 }, _key = "Int", _map[_key] = { k: _key, v: 2 }, _key = "Int8", _map[_key] = { k: _key, v: 3 }, _key = "Int16", _map[_key] = { k: _key, v: 4 }, _key = "Int32", _map[_key] = { k: _key, v: 5 }, _key = "Int64", _map[_key] = { k: _key, v: 6 }, _key = "Uint", _map[_key] = { k: _key, v: 7 }, _key = "Uint8", _map[_key] = { k: _key, v: 8 }, _key = "Uint16", _map[_key] = { k: _key, v: 9 }, _key = "Uint32", _map[_key] = { k: _key, v: 10 }, _key = "Uint64", _map[_key] = { k: _key, v: 11 }, _key = "Uintptr", _map[_key] = { k: _key, v: 12 }, _key = "Float32", _map[_key] = { k: _key, v: 13 }, _key = "Float64", _map[_key] = { k: _key, v: 14 }, _key = "Complex64", _map[_key] = { k: _key, v: 15 }, _key = "Complex128", _map[_key] = { k: _key, v: 16 }, _key = "Array", _map[_key] = { k: _key, v: 17 }, _key = "Chan", _map[_key] = { k: _key, v: 18 }, _key = "Func", _map[_key] = { k: _key, v: 19 }, _key = "Interface", _map[_key] = { k: _key, v: 20 }, _key = "Map", _map[_key] = { k: _key, v: 21 }, _key = "Ptr", _map[_key] = { k: _key, v: 22 }, _key = "Slice", _map[_key] = { k: _key, v: 23 }, _key = "String", _map[_key] = { k: _key, v: 24 }, _key = "Struct", _map[_key] = { k: _key, v: 25 }, _key = "UnsafePointer", _map[_key] = { k: _key, v: 26 }, _map), ($mapType($String, Kind)));
		pkg.RecvDir = 1;
		pkg.SendDir = 2;
		pkg.BothDir = 3;
		$reflect = pkg;
		initialized = true;
		uint8Type = (x$14 = TypeOf(new $Uint8(0)), (x$14 !== null && x$14.constructor === ($ptrType(rtype)) ? x$14.$val : $typeAssertionFailed(x$14, ($ptrType(rtype)))));
	};
	jsType = function(typ) {
		return typ.jsType;
	};
	reflectType = function(typ) {
		return typ.reflectType();
	};
	isWrapped = function(typ) {
		var _ref;
		_ref = typ.Kind();
		if (_ref === 1 || _ref === 2 || _ref === 3 || _ref === 4 || _ref === 5 || _ref === 7 || _ref === 8 || _ref === 9 || _ref === 10 || _ref === 12 || _ref === 13 || _ref === 14 || _ref === 17 || _ref === 21 || _ref === 19 || _ref === 24 || _ref === 25) {
			return true;
		} else if (_ref === 22) {
			return typ.Elem().Kind() === 17;
		}
		return false;
	};
	copyStruct = function(dst, src, typ) {
		var fields, i, name;
		fields = jsType(typ).fields;
		i = 0;
		while (i < $parseInt(fields.length)) {
			name = $internalize(fields[i][0], $String);
			dst[$externalize(name, $String)] = src[$externalize(name, $String)];
			i = i + (1) >> 0;
		}
	};
	makeValue = function(t, v, fl) {
		var rt;
		rt = t.common();
		if ((t.Kind() === 17) || (t.Kind() === 25) || rt.pointers()) {
			return new Value.Ptr(rt, v, 0, (fl | ((t.Kind() >>> 0) << 4 >>> 0)) >>> 0);
		}
		if (t.Size() > 4 || (t.Kind() === 24)) {
			return new Value.Ptr(rt, $newDataPointer(v, jsType(rt.ptrTo())), 0, (((fl | ((t.Kind() >>> 0) << 4 >>> 0)) >>> 0) | 2) >>> 0);
		}
		return new Value.Ptr(rt, 0, v, (fl | ((t.Kind() >>> 0) << 4 >>> 0)) >>> 0);
	};
	MakeSlice = $pkg.MakeSlice = function(typ, len, cap) {
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
		return makeValue(typ, jsType(typ).make(len, cap, $externalize((function() {
			return jsType(typ.Elem()).zero();
		}), ($funcType([], [js.Object], false)))), 0);
	};
	jsObject = function() {
		return reflectType($packages[$externalize("github.com/gopherjs/gopherjs/js", $String)].Object);
	};
	TypeOf = $pkg.TypeOf = function(i) {
		var c;
		if (!initialized) {
			return new rtype.Ptr(0, 0, 0, 0, 0, 0, ($ptrType($Uintptr)).nil, 0, ($ptrType($String)).nil, ($ptrType(uncommonType)).nil, ($ptrType(rtype)).nil, 0);
		}
		if ($interfaceIsEqual(i, null)) {
			return null;
		}
		c = i.constructor;
		if (c.kind === undefined) {
			return jsObject();
		}
		return reflectType(c);
	};
	ValueOf = $pkg.ValueOf = function(i) {
		var c;
		if ($interfaceIsEqual(i, null)) {
			return new Value.Ptr(($ptrType(rtype)).nil, 0, 0, 0);
		}
		c = i.constructor;
		if (c.kind === undefined) {
			return new Value.Ptr(jsObject(), 0, i, 320);
		}
		return makeValue(reflectType(c), i.$val, 0);
	};
	rtype.Ptr.prototype.ptrTo = function() {
		var t;
		t = this;
		return reflectType($ptrType(jsType(t)));
	};
	rtype.prototype.ptrTo = function() { return this.$val.ptrTo(); };
	SliceOf = $pkg.SliceOf = function(t) {
		return reflectType($sliceType(jsType(t)));
	};
	Zero = $pkg.Zero = function(typ) {
		return makeValue(typ, jsType(typ).zero(), 0);
	};
	unsafe_New = function(typ) {
		var _ref;
		_ref = typ.Kind();
		if (_ref === 25) {
			return new (jsType(typ).Ptr)();
		} else if (_ref === 17) {
			return jsType(typ).zero();
		} else {
			return $newDataPointer(jsType(typ).zero(), jsType(typ.ptrTo()));
		}
	};
	makeInt = function(f, bits, t) {
		var typ, ptr, s, _ref;
		typ = t.common();
		if (typ.size > 4) {
			ptr = unsafe_New(typ);
			ptr.$set(bits);
			return new Value.Ptr(typ, ptr, 0, (((f | 2) >>> 0) | ((typ.Kind() >>> 0) << 4 >>> 0)) >>> 0);
		}
		s = 0;
		_ref = typ.Kind();
		if (_ref === 3) {
			new ($ptrType($Uintptr))(function() { return s; }, function($v) { s = $v; }).$set((bits.$low << 24 >> 24));
		} else if (_ref === 4) {
			new ($ptrType($Uintptr))(function() { return s; }, function($v) { s = $v; }).$set((bits.$low << 16 >> 16));
		} else if (_ref === 2 || _ref === 5) {
			new ($ptrType($Uintptr))(function() { return s; }, function($v) { s = $v; }).$set((bits.$low >> 0));
		} else if (_ref === 8) {
			new ($ptrType($Uintptr))(function() { return s; }, function($v) { s = $v; }).$set((bits.$low << 24 >>> 24));
		} else if (_ref === 9) {
			new ($ptrType($Uintptr))(function() { return s; }, function($v) { s = $v; }).$set((bits.$low << 16 >>> 16));
		} else if (_ref === 7 || _ref === 10 || _ref === 12) {
			new ($ptrType($Uintptr))(function() { return s; }, function($v) { s = $v; }).$set((bits.$low >>> 0));
		}
		return new Value.Ptr(typ, 0, s, (f | ((typ.Kind() >>> 0) << 4 >>> 0)) >>> 0);
	};
	memmove = function(adst, asrc, n) {
		adst.$set(asrc.$get());
	};
	loadScalar = function(p, n) {
		return p.$get();
	};
	chanclose = function(ch) {
		$panic(new runtime.NotSupportedError.Ptr("channels"));
	};
	chanrecv = function(t, ch, nb, val) {
		var selected = false, received = false;
		$panic(new runtime.NotSupportedError.Ptr("channels"));
	};
	chansend = function(t, ch, val, nb) {
		$panic(new runtime.NotSupportedError.Ptr("channels"));
	};
	mapaccess = function(t, m, key) {
		var k, entry;
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
		var kv, k, jsVal, et, newVal, entry;
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
		var k;
		k = key.$get();
		if (!(k.$key === undefined)) {
			k = k.$key();
		}
		delete m[$externalize($internalize(k, $String), $String)];
	};
	mapiterinit = function(t, m) {
		return new mapIter.Ptr(t, m, $keys(m), 0);
	};
	mapiterkey = function(it) {
		var iter, k;
		iter = it;
		k = iter.keys[iter.i];
		return $newDataPointer(iter.m[$externalize($internalize(k, $String), $String)].k, jsType(PtrTo(iter.t.Key())));
	};
	mapiternext = function(it) {
		var iter;
		iter = it;
		iter.i = iter.i + (1) >> 0;
	};
	maplen = function(m) {
		return $parseInt($keys(m).length);
	};
	cvtDirect = function(v, typ) {
		var srcVal, val, k, _ref, slice;
		srcVal = v.iword();
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
			val = new (jsType(typ).Ptr)();
			copyStruct(val, srcVal, typ);
		} else if (_ref === 17 || _ref === 19 || _ref === 20 || _ref === 21 || _ref === 24) {
			val = v.ptr;
		} else {
			$panic(new ValueError.Ptr("reflect.Convert", k));
		} }
		return new Value.Ptr(typ.common(), val, 0, (((v.flag & 3) >>> 0) | ((typ.Kind() >>> 0) << 4 >>> 0)) >>> 0);
	};
	methodReceiver = function(op, v, i) {
		var rcvrtype = ($ptrType(rtype)).nil, t = ($ptrType(rtype)).nil, fn = 0, name, tt, x$1, m, iface, ut, x$2, m$1, rcvr;
		name = "";
		if (v.typ.Kind() === 20) {
			tt = v.typ.interfaceType;
			if (i < 0 || i >= tt.methods.$length) {
				$panic(new $String("reflect: internal error: invalid method index"));
			}
			m = (x$1 = tt.methods, ((i < 0 || i >= x$1.$length) ? $throwRuntimeError("index out of range") : x$1.$array[x$1.$offset + i]));
			if (!($pointerIsEqual(m.pkgPath, ($ptrType($String)).nil))) {
				$panic(new $String("reflect: " + op + " of unexported method"));
			}
			iface = $clone(v.ptr, nonEmptyInterface);
			if (iface.itab === ($ptrType(($structType([["ityp", "ityp", "reflect", ($ptrType(rtype)), ""], ["typ", "typ", "reflect", ($ptrType(rtype)), ""], ["link", "link", "reflect", $UnsafePointer, ""], ["bad", "bad", "reflect", $Int32, ""], ["unused", "unused", "reflect", $Int32, ""], ["fun", "fun", "reflect", ($arrayType($UnsafePointer, 100000)), ""]])))).nil) {
				$panic(new $String("reflect: " + op + " of method on nil interface value"));
			}
			t = m.typ;
			name = m.name.$get();
		} else {
			ut = v.typ.uncommonType.uncommon();
			if (ut === ($ptrType(uncommonType)).nil || i < 0 || i >= ut.methods.$length) {
				$panic(new $String("reflect: internal error: invalid method index"));
			}
			m$1 = (x$2 = ut.methods, ((i < 0 || i >= x$2.$length) ? $throwRuntimeError("index out of range") : x$2.$array[x$2.$offset + i]));
			if (!($pointerIsEqual(m$1.pkgPath, ($ptrType($String)).nil))) {
				$panic(new $String("reflect: " + op + " of unexported method"));
			}
			t = m$1.mtyp;
			name = $internalize(jsType(v.typ).methods[i][0], $String);
		}
		rcvr = v.iword();
		if (isWrapped(v.typ)) {
			rcvr = new (jsType(v.typ))(rcvr);
		}
		fn = rcvr[$externalize(name, $String)];
		return [rcvrtype, t, fn];
	};
	valueInterface = function(v, safe) {
		if (v.flag === 0) {
			$panic(new ValueError.Ptr("reflect.Value.Interface", 0));
		}
		if (safe && !((((v.flag & 1) >>> 0) === 0))) {
			$panic(new $String("reflect.Value.Interface: cannot return value obtained from unexported field or method"));
		}
		if (!((((v.flag & 8) >>> 0) === 0))) {
			$copy(v, makeMethodValue("Interface", $clone(v, Value)), Value);
		}
		if (isWrapped(v.typ)) {
			return new (jsType(v.typ))(v.iword());
		}
		return v.iword();
	};
	ifaceE2I = function(t, src, dst) {
		dst.$set(src);
	};
	methodName = function() {
		return "?FIXME?";
	};
	makeMethodValue = function(op, v) {
		var _tuple, fn, rcvr, fv;
		if (((v.flag & 8) >>> 0) === 0) {
			$panic(new $String("reflect: internal error: invalid use of makePartialFunc"));
		}
		_tuple = methodReceiver(op, $clone(v, Value), (v.flag >> 0) >> 9 >> 0); fn = _tuple[2];
		rcvr = v.iword();
		if (isWrapped(v.typ)) {
			rcvr = new (jsType(v.typ))(rcvr);
		}
		fv = (function() {
			return fn.apply(rcvr, $externalize(new ($sliceType(js.Object))($global.Array.prototype.slice.call(arguments, [])), ($sliceType(js.Object))));
		});
		return new Value.Ptr(v.Type().common(), fv, 0, (((v.flag & 1) >>> 0) | 304) >>> 0);
	};
	rtype.Ptr.prototype.pointers = function() {
		var t, _ref;
		t = this;
		_ref = t.Kind();
		if (_ref === 22 || _ref === 21 || _ref === 18 || _ref === 19 || _ref === 25 || _ref === 17) {
			return true;
		} else {
			return false;
		}
	};
	rtype.prototype.pointers = function() { return this.$val.pointers(); };
	uncommonType.Ptr.prototype.Method = function(i) {
		var m = new Method.Ptr(), t, x$1, p, fl, mt, name, fn;
		t = this;
		if (t === ($ptrType(uncommonType)).nil || i < 0 || i >= t.methods.$length) {
			$panic(new $String("reflect: Method index out of range"));
		}
		p = (x$1 = t.methods, ((i < 0 || i >= x$1.$length) ? $throwRuntimeError("index out of range") : x$1.$array[x$1.$offset + i]));
		if (!($pointerIsEqual(p.name, ($ptrType($String)).nil))) {
			m.Name = p.name.$get();
		}
		fl = 304;
		if (!($pointerIsEqual(p.pkgPath, ($ptrType($String)).nil))) {
			m.PkgPath = p.pkgPath.$get();
			fl = (fl | (1)) >>> 0;
		}
		mt = p.typ;
		m.Type = mt;
		name = $internalize(t.jsType.methods[i][0], $String);
		fn = (function(rcvr) {
			return rcvr[$externalize(name, $String)].apply(rcvr, $externalize($subslice(new ($sliceType(js.Object))($global.Array.prototype.slice.call(arguments, [])), 1), ($sliceType(js.Object))));
		});
		$copy(m.Func, new Value.Ptr(mt, fn, 0, fl), Value);
		m.Index = i;
		return m;
	};
	uncommonType.prototype.Method = function(i) { return this.$val.Method(i); };
	Value.Ptr.prototype.iword = function() {
		var v, val, _ref, newVal;
		v = new Value.Ptr(); $copy(v, this, Value);
		if ((v.typ.Kind() === 17) || (v.typ.Kind() === 25)) {
			return v.ptr;
		}
		if (!((((v.flag & 2) >>> 0) === 0))) {
			val = v.ptr.$get();
			if (!(val === null) && !(val.constructor === jsType(v.typ))) {
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
		if (v.typ.pointers()) {
			return v.ptr;
		}
		return v.scalar;
	};
	Value.prototype.iword = function() { return this.$val.iword(); };
	Value.Ptr.prototype.call = function(op, in$1) {
		var v, t, fn, rcvr, _tuple, isSlice, n, _ref, _i, x$1, i, _tmp, _tmp$1, xt, targ, m, slice, elem, i$1, x$2, x$3, xt$1, origIn, nin, nout, argsArray, _ref$1, _i$1, i$2, arg, results, _ref$2, ret, _ref$3, _i$2, i$3;
		v = new Value.Ptr(); $copy(v, this, Value);
		t = v.typ;
		fn = 0;
		rcvr = null;
		if (!((((v.flag & 8) >>> 0) === 0))) {
			_tuple = methodReceiver(op, $clone(v, Value), (v.flag >> 0) >> 9 >> 0); t = _tuple[1]; fn = _tuple[2];
			rcvr = v.iword();
			if (isWrapped(v.typ)) {
				rcvr = new (jsType(v.typ))(rcvr);
			}
		} else {
			fn = v.iword();
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
		while (_i < _ref.$length) {
			x$1 = new Value.Ptr(); $copy(x$1, ((_i < 0 || _i >= _ref.$length) ? $throwRuntimeError("index out of range") : _ref.$array[_ref.$offset + _i]), Value);
			if (x$1.Kind() === 0) {
				$panic(new $String("reflect: " + op + " using zero Value argument"));
			}
			_i++;
		}
		i = 0;
		while (i < n) {
			_tmp = ((i < 0 || i >= in$1.$length) ? $throwRuntimeError("index out of range") : in$1.$array[in$1.$offset + i]).Type(); _tmp$1 = t.In(i); xt = _tmp; targ = _tmp$1;
			if (!xt.AssignableTo(targ)) {
				$panic(new $String("reflect: " + op + " using " + xt.String() + " as type " + targ.String()));
			}
			i = i + (1) >> 0;
		}
		if (!isSlice && t.IsVariadic()) {
			m = in$1.$length - n >> 0;
			slice = new Value.Ptr(); $copy(slice, MakeSlice(t.In(n), m, m), Value);
			elem = t.In(n).Elem();
			i$1 = 0;
			while (i$1 < m) {
				x$3 = new Value.Ptr(); $copy(x$3, (x$2 = n + i$1 >> 0, ((x$2 < 0 || x$2 >= in$1.$length) ? $throwRuntimeError("index out of range") : in$1.$array[in$1.$offset + x$2])), Value);
				xt$1 = x$3.Type();
				if (!xt$1.AssignableTo(elem)) {
					$panic(new $String("reflect: cannot use " + xt$1.String() + " as type " + elem.String() + " in " + op));
				}
				slice.Index(i$1).Set($clone(x$3, Value));
				i$1 = i$1 + (1) >> 0;
			}
			origIn = in$1;
			in$1 = ($sliceType(Value)).make((n + 1 >> 0));
			$copySlice($subslice(in$1, 0, n), origIn);
			$copy(((n < 0 || n >= in$1.$length) ? $throwRuntimeError("index out of range") : in$1.$array[in$1.$offset + n]), slice, Value);
		}
		nin = in$1.$length;
		if (!((nin === t.NumIn()))) {
			$panic(new $String("reflect.Value.Call: wrong argument count"));
		}
		nout = t.NumOut();
		argsArray = new ($global.Array)(t.NumIn());
		_ref$1 = in$1;
		_i$1 = 0;
		while (_i$1 < _ref$1.$length) {
			i$2 = _i$1;
			arg = new Value.Ptr(); $copy(arg, ((_i$1 < 0 || _i$1 >= _ref$1.$length) ? $throwRuntimeError("index out of range") : _ref$1.$array[_ref$1.$offset + _i$1]), Value);
			argsArray[i$2] = arg.assignTo("reflect.Value.Call", t.In(i$2).common(), ($ptrType($emptyInterface)).nil).iword();
			_i$1++;
		}
		results = fn.apply(rcvr, argsArray);
		_ref$2 = nout;
		if (_ref$2 === 0) {
			return ($sliceType(Value)).nil;
		} else if (_ref$2 === 1) {
			return new ($sliceType(Value))([$clone(makeValue(t.Out(0), results, 0), Value)]);
		} else {
			ret = ($sliceType(Value)).make(nout);
			_ref$3 = ret;
			_i$2 = 0;
			while (_i$2 < _ref$3.$length) {
				i$3 = _i$2;
				$copy(((i$3 < 0 || i$3 >= ret.$length) ? $throwRuntimeError("index out of range") : ret.$array[ret.$offset + i$3]), makeValue(t.Out(i$3), results[i$3], 0), Value);
				_i$2++;
			}
			return ret;
		}
	};
	Value.prototype.call = function(op, in$1) { return this.$val.call(op, in$1); };
	Value.Ptr.prototype.Cap = function() {
		var v, k, _ref;
		v = new Value.Ptr(); $copy(v, this, Value);
		k = (new flag(v.flag)).kind();
		_ref = k;
		if (_ref === 17) {
			return v.typ.Len();
		} else if (_ref === 23) {
			return $parseInt(v.iword().$capacity) >> 0;
		}
		$panic(new ValueError.Ptr("reflect.Value.Cap", k));
	};
	Value.prototype.Cap = function() { return this.$val.Cap(); };
	Value.Ptr.prototype.Elem = function() {
		var v, k, _ref, val, typ, val$1, tt, fl;
		v = new Value.Ptr(); $copy(v, this, Value);
		k = (new flag(v.flag)).kind();
		_ref = k;
		if (_ref === 20) {
			val = v.iword();
			if (val === null) {
				return new Value.Ptr(($ptrType(rtype)).nil, 0, 0, 0);
			}
			typ = reflectType(val.constructor);
			return makeValue(typ, val.$val, (v.flag & 1) >>> 0);
		} else if (_ref === 22) {
			if (v.IsNil()) {
				return new Value.Ptr(($ptrType(rtype)).nil, 0, 0, 0);
			}
			val$1 = v.iword();
			tt = v.typ.ptrType;
			fl = (((((v.flag & 1) >>> 0) | 2) >>> 0) | 4) >>> 0;
			fl = (fl | (((tt.elem.Kind() >>> 0) << 4 >>> 0))) >>> 0;
			return new Value.Ptr(tt.elem, val$1, 0, fl);
		} else {
			$panic(new ValueError.Ptr("reflect.Value.Elem", k));
		}
	};
	Value.prototype.Elem = function() { return this.$val.Elem(); };
	Value.Ptr.prototype.Field = function(i) {
		var v, tt, x$1, field, name, typ, fl, s;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBe(25);
		tt = v.typ.structType;
		if (i < 0 || i >= tt.fields.$length) {
			$panic(new $String("reflect: Field index out of range"));
		}
		field = (x$1 = tt.fields, ((i < 0 || i >= x$1.$length) ? $throwRuntimeError("index out of range") : x$1.$array[x$1.$offset + i]));
		name = $internalize(jsType(v.typ).fields[i][0], $String);
		typ = field.typ;
		fl = (v.flag & 7) >>> 0;
		if (!($pointerIsEqual(field.pkgPath, ($ptrType($String)).nil))) {
			fl = (fl | (1)) >>> 0;
		}
		fl = (fl | (((typ.Kind() >>> 0) << 4 >>> 0))) >>> 0;
		s = v.ptr;
		if (!((((fl & 2) >>> 0) === 0)) && !((typ.Kind() === 17)) && !((typ.Kind() === 25))) {
			return new Value.Ptr(typ, new (jsType(PtrTo(typ)))($externalize((function() {
				return s[$externalize(name, $String)];
			}), ($funcType([], [js.Object], false))), $externalize((function(v$1) {
				s[$externalize(name, $String)] = v$1;
			}), ($funcType([js.Object], [], false)))), 0, fl);
		}
		return makeValue(typ, s[$externalize(name, $String)], fl);
	};
	Value.prototype.Field = function(i) { return this.$val.Field(i); };
	Value.Ptr.prototype.Index = function(i) {
		var v, k, _ref, tt, typ, fl, a, s, tt$1, typ$1, fl$1, a$1, str, fl$2;
		v = new Value.Ptr(); $copy(v, this, Value);
		k = (new flag(v.flag)).kind();
		_ref = k;
		if (_ref === 17) {
			tt = v.typ.arrayType;
			if (i < 0 || i > (tt.len >> 0)) {
				$panic(new $String("reflect: array index out of range"));
			}
			typ = tt.elem;
			fl = (v.flag & 7) >>> 0;
			fl = (fl | (((typ.Kind() >>> 0) << 4 >>> 0))) >>> 0;
			a = v.ptr;
			if (!((((fl & 2) >>> 0) === 0)) && !((typ.Kind() === 17)) && !((typ.Kind() === 25))) {
				return new Value.Ptr(typ, new (jsType(PtrTo(typ)))($externalize((function() {
					return a[i];
				}), ($funcType([], [js.Object], false))), $externalize((function(v$1) {
					a[i] = v$1;
				}), ($funcType([js.Object], [], false)))), 0, fl);
			}
			return makeValue(typ, a[i], fl);
		} else if (_ref === 23) {
			s = v.iword();
			if (i < 0 || i >= ($parseInt(s.$length) >> 0)) {
				$panic(new $String("reflect: slice index out of range"));
			}
			tt$1 = v.typ.sliceType;
			typ$1 = tt$1.elem;
			fl$1 = (6 | ((v.flag & 1) >>> 0)) >>> 0;
			fl$1 = (fl$1 | (((typ$1.Kind() >>> 0) << 4 >>> 0))) >>> 0;
			i = i + (($parseInt(s.$offset) >> 0)) >> 0;
			a$1 = s.$array;
			if (!((((fl$1 & 2) >>> 0) === 0)) && !((typ$1.Kind() === 17)) && !((typ$1.Kind() === 25))) {
				return new Value.Ptr(typ$1, new (jsType(PtrTo(typ$1)))($externalize((function() {
					return a$1[i];
				}), ($funcType([], [js.Object], false))), $externalize((function(v$1) {
					a$1[i] = v$1;
				}), ($funcType([js.Object], [], false)))), 0, fl$1);
			}
			return makeValue(typ$1, a$1[i], fl$1);
		} else if (_ref === 24) {
			str = v.ptr.$get();
			if (i < 0 || i >= str.length) {
				$panic(new $String("reflect: string index out of range"));
			}
			fl$2 = (((v.flag & 1) >>> 0) | 128) >>> 0;
			return new Value.Ptr(uint8Type, 0, (str.charCodeAt(i) >>> 0), fl$2);
		} else {
			$panic(new ValueError.Ptr("reflect.Value.Index", k));
		}
	};
	Value.prototype.Index = function(i) { return this.$val.Index(i); };
	Value.Ptr.prototype.IsNil = function() {
		var v, k, _ref;
		v = new Value.Ptr(); $copy(v, this, Value);
		k = (new flag(v.flag)).kind();
		_ref = k;
		if (_ref === 18 || _ref === 22 || _ref === 23) {
			return v.iword() === jsType(v.typ).nil;
		} else if (_ref === 19) {
			return v.iword() === $throwNilPointerError;
		} else if (_ref === 21) {
			return v.iword() === false;
		} else if (_ref === 20) {
			return v.iword() === null;
		} else {
			$panic(new ValueError.Ptr("reflect.Value.IsNil", k));
		}
	};
	Value.prototype.IsNil = function() { return this.$val.IsNil(); };
	Value.Ptr.prototype.Len = function() {
		var v, k, _ref;
		v = new Value.Ptr(); $copy(v, this, Value);
		k = (new flag(v.flag)).kind();
		_ref = k;
		if (_ref === 17 || _ref === 24) {
			return $parseInt(v.iword().length);
		} else if (_ref === 23) {
			return $parseInt(v.iword().$length) >> 0;
		} else if (_ref === 21) {
			return $parseInt($keys(v.iword()).length);
		} else {
			$panic(new ValueError.Ptr("reflect.Value.Len", k));
		}
	};
	Value.prototype.Len = function() { return this.$val.Len(); };
	Value.Ptr.prototype.Pointer = function() {
		var v, k, _ref;
		v = new Value.Ptr(); $copy(v, this, Value);
		k = (new flag(v.flag)).kind();
		_ref = k;
		if (_ref === 18 || _ref === 21 || _ref === 22 || _ref === 23 || _ref === 26) {
			if (v.IsNil()) {
				return 0;
			}
			return v.iword();
		} else if (_ref === 19) {
			if (v.IsNil()) {
				return 0;
			}
			return 1;
		} else {
			$panic(new ValueError.Ptr("reflect.Value.Pointer", k));
		}
	};
	Value.prototype.Pointer = function() { return this.$val.Pointer(); };
	Value.Ptr.prototype.Set = function(x$1) {
		var v, _ref;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBeAssignable();
		(new flag(x$1.flag)).mustBeExported();
		$copy(x$1, x$1.assignTo("reflect.Set", v.typ, ($ptrType($emptyInterface)).nil), Value);
		if (!((((v.flag & 2) >>> 0) === 0))) {
			_ref = v.typ.Kind();
			if (_ref === 17) {
				$copy(v.ptr, x$1.ptr, jsType(v.typ));
			} else if (_ref === 20) {
				v.ptr.$set(valueInterface($clone(x$1, Value), false));
			} else if (_ref === 25) {
				copyStruct(v.ptr, x$1.ptr, v.typ);
			} else {
				v.ptr.$set(x$1.iword());
			}
			return;
		}
		v.ptr = x$1.ptr;
	};
	Value.prototype.Set = function(x$1) { return this.$val.Set(x$1); };
	Value.Ptr.prototype.SetCap = function(n) {
		var v, s, newSlice;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBeAssignable();
		(new flag(v.flag)).mustBe(23);
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
	Value.Ptr.prototype.SetLen = function(n) {
		var v, s, newSlice;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBeAssignable();
		(new flag(v.flag)).mustBe(23);
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
	Value.Ptr.prototype.Slice = function(i, j) {
		var v, cap, typ, s, kind, _ref, tt, str;
		v = new Value.Ptr(); $copy(v, this, Value);
		cap = 0;
		typ = null;
		s = null;
		kind = (new flag(v.flag)).kind();
		_ref = kind;
		if (_ref === 17) {
			if (((v.flag & 4) >>> 0) === 0) {
				$panic(new $String("reflect.Value.Slice: slice of unaddressable array"));
			}
			tt = v.typ.arrayType;
			cap = (tt.len >> 0);
			typ = SliceOf(tt.elem);
			s = new (jsType(typ))(v.iword());
		} else if (_ref === 23) {
			typ = v.typ;
			s = v.iword();
			cap = $parseInt(s.$capacity) >> 0;
		} else if (_ref === 24) {
			str = v.ptr.$get();
			if (i < 0 || j < i || j > str.length) {
				$panic(new $String("reflect.Value.Slice: string slice index out of bounds"));
			}
			return ValueOf(new $String(str.substring(i, j)));
		} else {
			$panic(new ValueError.Ptr("reflect.Value.Slice", kind));
		}
		if (i < 0 || j < i || j > cap) {
			$panic(new $String("reflect.Value.Slice: slice index out of bounds"));
		}
		return makeValue(typ, $subslice(s, i, j), (v.flag & 1) >>> 0);
	};
	Value.prototype.Slice = function(i, j) { return this.$val.Slice(i, j); };
	Value.Ptr.prototype.Slice3 = function(i, j, k) {
		var v, cap, typ, s, kind, _ref, tt;
		v = new Value.Ptr(); $copy(v, this, Value);
		cap = 0;
		typ = null;
		s = null;
		kind = (new flag(v.flag)).kind();
		_ref = kind;
		if (_ref === 17) {
			if (((v.flag & 4) >>> 0) === 0) {
				$panic(new $String("reflect.Value.Slice: slice of unaddressable array"));
			}
			tt = v.typ.arrayType;
			cap = (tt.len >> 0);
			typ = SliceOf(tt.elem);
			s = new (jsType(typ))(v.iword());
		} else if (_ref === 23) {
			typ = v.typ;
			s = v.iword();
			cap = $parseInt(s.$capacity) >> 0;
		} else {
			$panic(new ValueError.Ptr("reflect.Value.Slice3", kind));
		}
		if (i < 0 || j < i || k < j || k > cap) {
			$panic(new $String("reflect.Value.Slice3: slice index out of bounds"));
		}
		return makeValue(typ, $subslice(s, i, j, k), (v.flag & 1) >>> 0);
	};
	Value.prototype.Slice3 = function(i, j, k) { return this.$val.Slice3(i, j, k); };
	Kind.prototype.String = function() {
		var k;
		k = this.$val !== undefined ? this.$val : this;
		if ((k >> 0) < kindNames.$length) {
			return ((k < 0 || k >= kindNames.$length) ? $throwRuntimeError("index out of range") : kindNames.$array[kindNames.$offset + k]);
		}
		return "kind" + strconv.Itoa((k >> 0));
	};
	$ptrType(Kind).prototype.String = function() { return new Kind(this.$get()).String(); };
	uncommonType.Ptr.prototype.uncommon = function() {
		var t;
		t = this;
		return t;
	};
	uncommonType.prototype.uncommon = function() { return this.$val.uncommon(); };
	uncommonType.Ptr.prototype.PkgPath = function() {
		var t;
		t = this;
		if (t === ($ptrType(uncommonType)).nil || $pointerIsEqual(t.pkgPath, ($ptrType($String)).nil)) {
			return "";
		}
		return t.pkgPath.$get();
	};
	uncommonType.prototype.PkgPath = function() { return this.$val.PkgPath(); };
	uncommonType.Ptr.prototype.Name = function() {
		var t;
		t = this;
		if (t === ($ptrType(uncommonType)).nil || $pointerIsEqual(t.name, ($ptrType($String)).nil)) {
			return "";
		}
		return t.name.$get();
	};
	uncommonType.prototype.Name = function() { return this.$val.Name(); };
	rtype.Ptr.prototype.String = function() {
		var t;
		t = this;
		return t.string.$get();
	};
	rtype.prototype.String = function() { return this.$val.String(); };
	rtype.Ptr.prototype.Size = function() {
		var t;
		t = this;
		return t.size;
	};
	rtype.prototype.Size = function() { return this.$val.Size(); };
	rtype.Ptr.prototype.Bits = function() {
		var t, k, x$1;
		t = this;
		if (t === ($ptrType(rtype)).nil) {
			$panic(new $String("reflect: Bits of nil Type"));
		}
		k = t.Kind();
		if (k < 2 || k > 16) {
			$panic(new $String("reflect: Bits of non-arithmetic Type " + t.String()));
		}
		return (x$1 = (t.size >> 0), (((x$1 >>> 16 << 16) * 8 >> 0) + (x$1 << 16 >>> 16) * 8) >> 0);
	};
	rtype.prototype.Bits = function() { return this.$val.Bits(); };
	rtype.Ptr.prototype.Align = function() {
		var t;
		t = this;
		return (t.align >> 0);
	};
	rtype.prototype.Align = function() { return this.$val.Align(); };
	rtype.Ptr.prototype.FieldAlign = function() {
		var t;
		t = this;
		return (t.fieldAlign >> 0);
	};
	rtype.prototype.FieldAlign = function() { return this.$val.FieldAlign(); };
	rtype.Ptr.prototype.Kind = function() {
		var t;
		t = this;
		return (((t.kind & 127) >>> 0) >>> 0);
	};
	rtype.prototype.Kind = function() { return this.$val.Kind(); };
	rtype.Ptr.prototype.common = function() {
		var t;
		t = this;
		return t;
	};
	rtype.prototype.common = function() { return this.$val.common(); };
	uncommonType.Ptr.prototype.NumMethod = function() {
		var t;
		t = this;
		if (t === ($ptrType(uncommonType)).nil) {
			return 0;
		}
		return t.methods.$length;
	};
	uncommonType.prototype.NumMethod = function() { return this.$val.NumMethod(); };
	uncommonType.Ptr.prototype.MethodByName = function(name) {
		var m = new Method.Ptr(), ok = false, t, p, _ref, _i, i, x$1, _tmp, _tmp$1;
		t = this;
		if (t === ($ptrType(uncommonType)).nil) {
			return [m, ok];
		}
		p = ($ptrType(method)).nil;
		_ref = t.methods;
		_i = 0;
		while (_i < _ref.$length) {
			i = _i;
			p = (x$1 = t.methods, ((i < 0 || i >= x$1.$length) ? $throwRuntimeError("index out of range") : x$1.$array[x$1.$offset + i]));
			if (!($pointerIsEqual(p.name, ($ptrType($String)).nil)) && p.name.$get() === name) {
				_tmp = new Method.Ptr(); $copy(_tmp, t.Method(i), Method); _tmp$1 = true; $copy(m, _tmp, Method); ok = _tmp$1;
				return [m, ok];
			}
			_i++;
		}
		return [m, ok];
	};
	uncommonType.prototype.MethodByName = function(name) { return this.$val.MethodByName(name); };
	rtype.Ptr.prototype.NumMethod = function() {
		var t, tt;
		t = this;
		if (t.Kind() === 20) {
			tt = t.interfaceType;
			return tt.NumMethod();
		}
		return t.uncommonType.NumMethod();
	};
	rtype.prototype.NumMethod = function() { return this.$val.NumMethod(); };
	rtype.Ptr.prototype.Method = function(i) {
		var m = new Method.Ptr(), t, tt;
		t = this;
		if (t.Kind() === 20) {
			tt = t.interfaceType;
			$copy(m, tt.Method(i), Method);
			return m;
		}
		$copy(m, t.uncommonType.Method(i), Method);
		return m;
	};
	rtype.prototype.Method = function(i) { return this.$val.Method(i); };
	rtype.Ptr.prototype.MethodByName = function(name) {
		var m = new Method.Ptr(), ok = false, t, tt, _tuple, _tuple$1;
		t = this;
		if (t.Kind() === 20) {
			tt = t.interfaceType;
			_tuple = tt.MethodByName(name); $copy(m, _tuple[0], Method); ok = _tuple[1];
			return [m, ok];
		}
		_tuple$1 = t.uncommonType.MethodByName(name); $copy(m, _tuple$1[0], Method); ok = _tuple$1[1];
		return [m, ok];
	};
	rtype.prototype.MethodByName = function(name) { return this.$val.MethodByName(name); };
	rtype.Ptr.prototype.PkgPath = function() {
		var t;
		t = this;
		return t.uncommonType.PkgPath();
	};
	rtype.prototype.PkgPath = function() { return this.$val.PkgPath(); };
	rtype.Ptr.prototype.Name = function() {
		var t;
		t = this;
		return t.uncommonType.Name();
	};
	rtype.prototype.Name = function() { return this.$val.Name(); };
	rtype.Ptr.prototype.ChanDir = function() {
		var t, tt;
		t = this;
		if (!((t.Kind() === 18))) {
			$panic(new $String("reflect: ChanDir of non-chan type"));
		}
		tt = t.chanType;
		return (tt.dir >> 0);
	};
	rtype.prototype.ChanDir = function() { return this.$val.ChanDir(); };
	rtype.Ptr.prototype.IsVariadic = function() {
		var t, tt;
		t = this;
		if (!((t.Kind() === 19))) {
			$panic(new $String("reflect: IsVariadic of non-func type"));
		}
		tt = t.funcType;
		return tt.dotdotdot;
	};
	rtype.prototype.IsVariadic = function() { return this.$val.IsVariadic(); };
	rtype.Ptr.prototype.Elem = function() {
		var t, _ref, tt, tt$1, tt$2, tt$3, tt$4;
		t = this;
		_ref = t.Kind();
		if (_ref === 17) {
			tt = t.arrayType;
			return toType(tt.elem);
		} else if (_ref === 18) {
			tt$1 = t.chanType;
			return toType(tt$1.elem);
		} else if (_ref === 21) {
			tt$2 = t.mapType;
			return toType(tt$2.elem);
		} else if (_ref === 22) {
			tt$3 = t.ptrType;
			return toType(tt$3.elem);
		} else if (_ref === 23) {
			tt$4 = t.sliceType;
			return toType(tt$4.elem);
		}
		$panic(new $String("reflect: Elem of invalid type"));
	};
	rtype.prototype.Elem = function() { return this.$val.Elem(); };
	rtype.Ptr.prototype.Field = function(i) {
		var t, tt;
		t = this;
		if (!((t.Kind() === 25))) {
			$panic(new $String("reflect: Field of non-struct type"));
		}
		tt = t.structType;
		return tt.Field(i);
	};
	rtype.prototype.Field = function(i) { return this.$val.Field(i); };
	rtype.Ptr.prototype.FieldByIndex = function(index) {
		var t, tt;
		t = this;
		if (!((t.Kind() === 25))) {
			$panic(new $String("reflect: FieldByIndex of non-struct type"));
		}
		tt = t.structType;
		return tt.FieldByIndex(index);
	};
	rtype.prototype.FieldByIndex = function(index) { return this.$val.FieldByIndex(index); };
	rtype.Ptr.prototype.FieldByName = function(name) {
		var t, tt;
		t = this;
		if (!((t.Kind() === 25))) {
			$panic(new $String("reflect: FieldByName of non-struct type"));
		}
		tt = t.structType;
		return tt.FieldByName(name);
	};
	rtype.prototype.FieldByName = function(name) { return this.$val.FieldByName(name); };
	rtype.Ptr.prototype.FieldByNameFunc = function(match) {
		var t, tt;
		t = this;
		if (!((t.Kind() === 25))) {
			$panic(new $String("reflect: FieldByNameFunc of non-struct type"));
		}
		tt = t.structType;
		return tt.FieldByNameFunc(match);
	};
	rtype.prototype.FieldByNameFunc = function(match) { return this.$val.FieldByNameFunc(match); };
	rtype.Ptr.prototype.In = function(i) {
		var t, tt, x$1;
		t = this;
		if (!((t.Kind() === 19))) {
			$panic(new $String("reflect: In of non-func type"));
		}
		tt = t.funcType;
		return toType((x$1 = tt.in$2, ((i < 0 || i >= x$1.$length) ? $throwRuntimeError("index out of range") : x$1.$array[x$1.$offset + i])));
	};
	rtype.prototype.In = function(i) { return this.$val.In(i); };
	rtype.Ptr.prototype.Key = function() {
		var t, tt;
		t = this;
		if (!((t.Kind() === 21))) {
			$panic(new $String("reflect: Key of non-map type"));
		}
		tt = t.mapType;
		return toType(tt.key);
	};
	rtype.prototype.Key = function() { return this.$val.Key(); };
	rtype.Ptr.prototype.Len = function() {
		var t, tt;
		t = this;
		if (!((t.Kind() === 17))) {
			$panic(new $String("reflect: Len of non-array type"));
		}
		tt = t.arrayType;
		return (tt.len >> 0);
	};
	rtype.prototype.Len = function() { return this.$val.Len(); };
	rtype.Ptr.prototype.NumField = function() {
		var t, tt;
		t = this;
		if (!((t.Kind() === 25))) {
			$panic(new $String("reflect: NumField of non-struct type"));
		}
		tt = t.structType;
		return tt.fields.$length;
	};
	rtype.prototype.NumField = function() { return this.$val.NumField(); };
	rtype.Ptr.prototype.NumIn = function() {
		var t, tt;
		t = this;
		if (!((t.Kind() === 19))) {
			$panic(new $String("reflect: NumIn of non-func type"));
		}
		tt = t.funcType;
		return tt.in$2.$length;
	};
	rtype.prototype.NumIn = function() { return this.$val.NumIn(); };
	rtype.Ptr.prototype.NumOut = function() {
		var t, tt;
		t = this;
		if (!((t.Kind() === 19))) {
			$panic(new $String("reflect: NumOut of non-func type"));
		}
		tt = t.funcType;
		return tt.out.$length;
	};
	rtype.prototype.NumOut = function() { return this.$val.NumOut(); };
	rtype.Ptr.prototype.Out = function(i) {
		var t, tt, x$1;
		t = this;
		if (!((t.Kind() === 19))) {
			$panic(new $String("reflect: Out of non-func type"));
		}
		tt = t.funcType;
		return toType((x$1 = tt.out, ((i < 0 || i >= x$1.$length) ? $throwRuntimeError("index out of range") : x$1.$array[x$1.$offset + i])));
	};
	rtype.prototype.Out = function(i) { return this.$val.Out(i); };
	ChanDir.prototype.String = function() {
		var d, _ref;
		d = this.$val !== undefined ? this.$val : this;
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
	interfaceType.Ptr.prototype.Method = function(i) {
		var m = new Method.Ptr(), t, x$1, p;
		t = this;
		if (i < 0 || i >= t.methods.$length) {
			return m;
		}
		p = (x$1 = t.methods, ((i < 0 || i >= x$1.$length) ? $throwRuntimeError("index out of range") : x$1.$array[x$1.$offset + i]));
		m.Name = p.name.$get();
		if (!($pointerIsEqual(p.pkgPath, ($ptrType($String)).nil))) {
			m.PkgPath = p.pkgPath.$get();
		}
		m.Type = toType(p.typ);
		m.Index = i;
		return m;
	};
	interfaceType.prototype.Method = function(i) { return this.$val.Method(i); };
	interfaceType.Ptr.prototype.NumMethod = function() {
		var t;
		t = this;
		return t.methods.$length;
	};
	interfaceType.prototype.NumMethod = function() { return this.$val.NumMethod(); };
	interfaceType.Ptr.prototype.MethodByName = function(name) {
		var m = new Method.Ptr(), ok = false, t, p, _ref, _i, i, x$1, _tmp, _tmp$1;
		t = this;
		if (t === ($ptrType(interfaceType)).nil) {
			return [m, ok];
		}
		p = ($ptrType(imethod)).nil;
		_ref = t.methods;
		_i = 0;
		while (_i < _ref.$length) {
			i = _i;
			p = (x$1 = t.methods, ((i < 0 || i >= x$1.$length) ? $throwRuntimeError("index out of range") : x$1.$array[x$1.$offset + i]));
			if (p.name.$get() === name) {
				_tmp = new Method.Ptr(); $copy(_tmp, t.Method(i), Method); _tmp$1 = true; $copy(m, _tmp, Method); ok = _tmp$1;
				return [m, ok];
			}
			_i++;
		}
		return [m, ok];
	};
	interfaceType.prototype.MethodByName = function(name) { return this.$val.MethodByName(name); };
	StructTag.prototype.Get = function(key) {
		var tag, i, name, qvalue, _tuple, value;
		tag = this.$val !== undefined ? this.$val : this;
		while (!(tag === "")) {
			i = 0;
			while (i < tag.length && (tag.charCodeAt(i) === 32)) {
				i = i + (1) >> 0;
			}
			tag = tag.substring(i);
			if (tag === "") {
				break;
			}
			i = 0;
			while (i < tag.length && !((tag.charCodeAt(i) === 32)) && !((tag.charCodeAt(i) === 58)) && !((tag.charCodeAt(i) === 34))) {
				i = i + (1) >> 0;
			}
			if ((i + 1 >> 0) >= tag.length || !((tag.charCodeAt(i) === 58)) || !((tag.charCodeAt((i + 1 >> 0)) === 34))) {
				break;
			}
			name = tag.substring(0, i);
			tag = tag.substring((i + 1 >> 0));
			i = 1;
			while (i < tag.length && !((tag.charCodeAt(i) === 34))) {
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
	structType.Ptr.prototype.Field = function(i) {
		var f = new StructField.Ptr(), t, x$1, p, t$1;
		t = this;
		if (i < 0 || i >= t.fields.$length) {
			return f;
		}
		p = (x$1 = t.fields, ((i < 0 || i >= x$1.$length) ? $throwRuntimeError("index out of range") : x$1.$array[x$1.$offset + i]));
		f.Type = toType(p.typ);
		if (!($pointerIsEqual(p.name, ($ptrType($String)).nil))) {
			f.Name = p.name.$get();
		} else {
			t$1 = f.Type;
			if (t$1.Kind() === 22) {
				t$1 = t$1.Elem();
			}
			f.Name = t$1.Name();
			f.Anonymous = true;
		}
		if (!($pointerIsEqual(p.pkgPath, ($ptrType($String)).nil))) {
			f.PkgPath = p.pkgPath.$get();
		}
		if (!($pointerIsEqual(p.tag, ($ptrType($String)).nil))) {
			f.Tag = p.tag.$get();
		}
		f.Offset = p.offset;
		f.Index = new ($sliceType($Int))([i]);
		return f;
	};
	structType.prototype.Field = function(i) { return this.$val.Field(i); };
	structType.Ptr.prototype.FieldByIndex = function(index) {
		var f = new StructField.Ptr(), t, _ref, _i, i, x$1, ft;
		t = this;
		f.Type = toType(t.rtype);
		_ref = index;
		_i = 0;
		while (_i < _ref.$length) {
			i = _i;
			x$1 = ((_i < 0 || _i >= _ref.$length) ? $throwRuntimeError("index out of range") : _ref.$array[_ref.$offset + _i]);
			if (i > 0) {
				ft = f.Type;
				if ((ft.Kind() === 22) && (ft.Elem().Kind() === 25)) {
					ft = ft.Elem();
				}
				f.Type = ft;
			}
			$copy(f, f.Type.Field(x$1), StructField);
			_i++;
		}
		return f;
	};
	structType.prototype.FieldByIndex = function(index) { return this.$val.FieldByIndex(index); };
	structType.Ptr.prototype.FieldByNameFunc = function(match) {
		var result = new StructField.Ptr(), ok = false, t, current, next, nextCount, visited, _map, _key, _tmp, _tmp$1, count, _ref, _i, scan, t$1, _entry, _key$1, _ref$1, _i$1, i, x$1, f, fname, ntyp, _entry$1, _tmp$2, _tmp$3, styp, _entry$2, _key$2, _map$1, _key$3, _key$4, _entry$3, _key$5, index;
		t = this;
		current = new ($sliceType(fieldScan))([]);
		next = new ($sliceType(fieldScan))([new fieldScan.Ptr(t, ($sliceType($Int)).nil)]);
		nextCount = false;
		visited = (_map = new $Map(), _map);
		while (next.$length > 0) {
			_tmp = next; _tmp$1 = $subslice(current, 0, 0); current = _tmp; next = _tmp$1;
			count = nextCount;
			nextCount = false;
			_ref = current;
			_i = 0;
			while (_i < _ref.$length) {
				scan = new fieldScan.Ptr(); $copy(scan, ((_i < 0 || _i >= _ref.$length) ? $throwRuntimeError("index out of range") : _ref.$array[_ref.$offset + _i]), fieldScan);
				t$1 = scan.typ;
				if ((_entry = visited[t$1.$key()], _entry !== undefined ? _entry.v : false)) {
					_i++;
					continue;
				}
				_key$1 = t$1; (visited || $throwRuntimeError("assignment to entry in nil map"))[_key$1.$key()] = { k: _key$1, v: true };
				_ref$1 = t$1.fields;
				_i$1 = 0;
				while (_i$1 < _ref$1.$length) {
					i = _i$1;
					f = (x$1 = t$1.fields, ((i < 0 || i >= x$1.$length) ? $throwRuntimeError("index out of range") : x$1.$array[x$1.$offset + i]));
					fname = "";
					ntyp = ($ptrType(rtype)).nil;
					if (!($pointerIsEqual(f.name, ($ptrType($String)).nil))) {
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
							_tmp$2 = new StructField.Ptr("", "", null, "", 0, ($sliceType($Int)).nil, false); _tmp$3 = false; $copy(result, _tmp$2, StructField); ok = _tmp$3;
							return [result, ok];
						}
						$copy(result, t$1.Field(i), StructField);
						result.Index = ($sliceType($Int)).nil;
						result.Index = $appendSlice(result.Index, scan.index);
						result.Index = $append(result.Index, i);
						ok = true;
						_i$1++;
						continue;
					}
					if (ok || ntyp === ($ptrType(rtype)).nil || !((ntyp.Kind() === 25))) {
						_i$1++;
						continue;
					}
					styp = ntyp.structType;
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
					index = ($sliceType($Int)).nil;
					index = $appendSlice(index, scan.index);
					index = $append(index, i);
					next = $append(next, new fieldScan.Ptr(styp, index));
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
	structType.Ptr.prototype.FieldByName = function(name) {
		var f = new StructField.Ptr(), present = false, t, hasAnon, _ref, _i, i, x$1, tf, _tmp, _tmp$1, _tuple;
		t = this;
		hasAnon = false;
		if (!(name === "")) {
			_ref = t.fields;
			_i = 0;
			while (_i < _ref.$length) {
				i = _i;
				tf = (x$1 = t.fields, ((i < 0 || i >= x$1.$length) ? $throwRuntimeError("index out of range") : x$1.$array[x$1.$offset + i]));
				if ($pointerIsEqual(tf.name, ($ptrType($String)).nil)) {
					hasAnon = true;
					_i++;
					continue;
				}
				if (tf.name.$get() === name) {
					_tmp = new StructField.Ptr(); $copy(_tmp, t.Field(i), StructField); _tmp$1 = true; $copy(f, _tmp, StructField); present = _tmp$1;
					return [f, present];
				}
				_i++;
			}
		}
		if (!hasAnon) {
			return [f, present];
		}
		_tuple = t.FieldByNameFunc((function(s) {
			return s === name;
		})); $copy(f, _tuple[0], StructField); present = _tuple[1];
		return [f, present];
	};
	structType.prototype.FieldByName = function(name) { return this.$val.FieldByName(name); };
	PtrTo = $pkg.PtrTo = function(t) {
		return (t !== null && t.constructor === ($ptrType(rtype)) ? t.$val : $typeAssertionFailed(t, ($ptrType(rtype)))).ptrTo();
	};
	rtype.Ptr.prototype.Implements = function(u) {
		var t;
		t = this;
		if ($interfaceIsEqual(u, null)) {
			$panic(new $String("reflect: nil type passed to Type.Implements"));
		}
		if (!((u.Kind() === 20))) {
			$panic(new $String("reflect: non-interface type passed to Type.Implements"));
		}
		return implements$1((u !== null && u.constructor === ($ptrType(rtype)) ? u.$val : $typeAssertionFailed(u, ($ptrType(rtype)))), t);
	};
	rtype.prototype.Implements = function(u) { return this.$val.Implements(u); };
	rtype.Ptr.prototype.AssignableTo = function(u) {
		var t, uu;
		t = this;
		if ($interfaceIsEqual(u, null)) {
			$panic(new $String("reflect: nil type passed to Type.AssignableTo"));
		}
		uu = (u !== null && u.constructor === ($ptrType(rtype)) ? u.$val : $typeAssertionFailed(u, ($ptrType(rtype))));
		return directlyAssignable(uu, t) || implements$1(uu, t);
	};
	rtype.prototype.AssignableTo = function(u) { return this.$val.AssignableTo(u); };
	rtype.Ptr.prototype.ConvertibleTo = function(u) {
		var t, uu;
		t = this;
		if ($interfaceIsEqual(u, null)) {
			$panic(new $String("reflect: nil type passed to Type.ConvertibleTo"));
		}
		uu = (u !== null && u.constructor === ($ptrType(rtype)) ? u.$val : $typeAssertionFailed(u, ($ptrType(rtype))));
		return !(convertOp(uu, t) === $throwNilPointerError);
	};
	rtype.prototype.ConvertibleTo = function(u) { return this.$val.ConvertibleTo(u); };
	implements$1 = function(T, V) {
		var t, v, i, j, x$1, tm, x$2, vm, v$1, i$1, j$1, x$3, tm$1, x$4, vm$1;
		if (!((T.Kind() === 20))) {
			return false;
		}
		t = T.interfaceType;
		if (t.methods.$length === 0) {
			return true;
		}
		if (V.Kind() === 20) {
			v = V.interfaceType;
			i = 0;
			j = 0;
			while (j < v.methods.$length) {
				tm = (x$1 = t.methods, ((i < 0 || i >= x$1.$length) ? $throwRuntimeError("index out of range") : x$1.$array[x$1.$offset + i]));
				vm = (x$2 = v.methods, ((j < 0 || j >= x$2.$length) ? $throwRuntimeError("index out of range") : x$2.$array[x$2.$offset + j]));
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
		if (v$1 === ($ptrType(uncommonType)).nil) {
			return false;
		}
		i$1 = 0;
		j$1 = 0;
		while (j$1 < v$1.methods.$length) {
			tm$1 = (x$3 = t.methods, ((i$1 < 0 || i$1 >= x$3.$length) ? $throwRuntimeError("index out of range") : x$3.$array[x$3.$offset + i$1]));
			vm$1 = (x$4 = v$1.methods, ((j$1 < 0 || j$1 >= x$4.$length) ? $throwRuntimeError("index out of range") : x$4.$array[x$4.$offset + j$1]));
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
		if (T === V) {
			return true;
		}
		if (!(T.Name() === "") && !(V.Name() === "") || !((T.Kind() === V.Kind()))) {
			return false;
		}
		return haveIdenticalUnderlyingType(T, V);
	};
	haveIdenticalUnderlyingType = function(T, V) {
		var kind, _ref, t, v, _ref$1, _i, i, typ, x$1, _ref$2, _i$1, i$1, typ$1, x$2, t$1, v$1, t$2, v$2, _ref$3, _i$2, i$2, x$3, tf, x$4, vf;
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
			t = T.funcType;
			v = V.funcType;
			if (!(t.dotdotdot === v.dotdotdot) || !((t.in$2.$length === v.in$2.$length)) || !((t.out.$length === v.out.$length))) {
				return false;
			}
			_ref$1 = t.in$2;
			_i = 0;
			while (_i < _ref$1.$length) {
				i = _i;
				typ = ((_i < 0 || _i >= _ref$1.$length) ? $throwRuntimeError("index out of range") : _ref$1.$array[_ref$1.$offset + _i]);
				if (!(typ === (x$1 = v.in$2, ((i < 0 || i >= x$1.$length) ? $throwRuntimeError("index out of range") : x$1.$array[x$1.$offset + i])))) {
					return false;
				}
				_i++;
			}
			_ref$2 = t.out;
			_i$1 = 0;
			while (_i$1 < _ref$2.$length) {
				i$1 = _i$1;
				typ$1 = ((_i$1 < 0 || _i$1 >= _ref$2.$length) ? $throwRuntimeError("index out of range") : _ref$2.$array[_ref$2.$offset + _i$1]);
				if (!(typ$1 === (x$2 = v.out, ((i$1 < 0 || i$1 >= x$2.$length) ? $throwRuntimeError("index out of range") : x$2.$array[x$2.$offset + i$1])))) {
					return false;
				}
				_i$1++;
			}
			return true;
		} else if (_ref === 20) {
			t$1 = T.interfaceType;
			v$1 = V.interfaceType;
			if ((t$1.methods.$length === 0) && (v$1.methods.$length === 0)) {
				return true;
			}
			return false;
		} else if (_ref === 21) {
			return $interfaceIsEqual(T.Key(), V.Key()) && $interfaceIsEqual(T.Elem(), V.Elem());
		} else if (_ref === 22 || _ref === 23) {
			return $interfaceIsEqual(T.Elem(), V.Elem());
		} else if (_ref === 25) {
			t$2 = T.structType;
			v$2 = V.structType;
			if (!((t$2.fields.$length === v$2.fields.$length))) {
				return false;
			}
			_ref$3 = t$2.fields;
			_i$2 = 0;
			while (_i$2 < _ref$3.$length) {
				i$2 = _i$2;
				tf = (x$3 = t$2.fields, ((i$2 < 0 || i$2 >= x$3.$length) ? $throwRuntimeError("index out of range") : x$3.$array[x$3.$offset + i$2]));
				vf = (x$4 = v$2.fields, ((i$2 < 0 || i$2 >= x$4.$length) ? $throwRuntimeError("index out of range") : x$4.$array[x$4.$offset + i$2]));
				if (!($pointerIsEqual(tf.name, vf.name)) && ($pointerIsEqual(tf.name, ($ptrType($String)).nil) || $pointerIsEqual(vf.name, ($ptrType($String)).nil) || !(tf.name.$get() === vf.name.$get()))) {
					return false;
				}
				if (!($pointerIsEqual(tf.pkgPath, vf.pkgPath)) && ($pointerIsEqual(tf.pkgPath, ($ptrType($String)).nil) || $pointerIsEqual(vf.pkgPath, ($ptrType($String)).nil) || !(tf.pkgPath.$get() === vf.pkgPath.$get()))) {
					return false;
				}
				if (!(tf.typ === vf.typ)) {
					return false;
				}
				if (!($pointerIsEqual(tf.tag, vf.tag)) && ($pointerIsEqual(tf.tag, ($ptrType($String)).nil) || $pointerIsEqual(vf.tag, ($ptrType($String)).nil) || !(tf.tag.$get() === vf.tag.$get()))) {
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
		if (t === ($ptrType(rtype)).nil) {
			return null;
		}
		return t;
	};
	flag.prototype.kind = function() {
		var f;
		f = this.$val !== undefined ? this.$val : this;
		return (((((f >>> 4 >>> 0)) & 31) >>> 0) >>> 0);
	};
	$ptrType(flag).prototype.kind = function() { return new flag(this.$get()).kind(); };
	Value.Ptr.prototype.pointer = function() {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		if (!((v.typ.size === 4)) || !v.typ.pointers()) {
			$panic(new $String("can't call pointer on a non-pointer Value"));
		}
		if (!((((v.flag & 2) >>> 0) === 0))) {
			return v.ptr.$get();
		}
		return v.ptr;
	};
	Value.prototype.pointer = function() { return this.$val.pointer(); };
	ValueError.Ptr.prototype.Error = function() {
		var e;
		e = this;
		if (e.Kind === 0) {
			return "reflect: call of " + e.Method + " on zero Value";
		}
		return "reflect: call of " + e.Method + " on " + (new Kind(e.Kind)).String() + " Value";
	};
	ValueError.prototype.Error = function() { return this.$val.Error(); };
	flag.prototype.mustBe = function(expected) {
		var f, k;
		f = this.$val !== undefined ? this.$val : this;
		k = (new flag(f)).kind();
		if (!((k === expected))) {
			$panic(new ValueError.Ptr(methodName(), k));
		}
	};
	$ptrType(flag).prototype.mustBe = function(expected) { return new flag(this.$get()).mustBe(expected); };
	flag.prototype.mustBeExported = function() {
		var f;
		f = this.$val !== undefined ? this.$val : this;
		if (f === 0) {
			$panic(new ValueError.Ptr(methodName(), 0));
		}
		if (!((((f & 1) >>> 0) === 0))) {
			$panic(new $String("reflect: " + methodName() + " using value obtained using unexported field"));
		}
	};
	$ptrType(flag).prototype.mustBeExported = function() { return new flag(this.$get()).mustBeExported(); };
	flag.prototype.mustBeAssignable = function() {
		var f;
		f = this.$val !== undefined ? this.$val : this;
		if (f === 0) {
			$panic(new ValueError.Ptr(methodName(), 0));
		}
		if (!((((f & 1) >>> 0) === 0))) {
			$panic(new $String("reflect: " + methodName() + " using value obtained using unexported field"));
		}
		if (((f & 4) >>> 0) === 0) {
			$panic(new $String("reflect: " + methodName() + " using unaddressable value"));
		}
	};
	$ptrType(flag).prototype.mustBeAssignable = function() { return new flag(this.$get()).mustBeAssignable(); };
	Value.Ptr.prototype.Addr = function() {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		if (((v.flag & 4) >>> 0) === 0) {
			$panic(new $String("reflect.Value.Addr of unaddressable value"));
		}
		return new Value.Ptr(v.typ.ptrTo(), v.ptr, 0, ((((v.flag & 1) >>> 0)) | 352) >>> 0);
	};
	Value.prototype.Addr = function() { return this.$val.Addr(); };
	Value.Ptr.prototype.Bool = function() {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBe(1);
		if (!((((v.flag & 2) >>> 0) === 0))) {
			return v.ptr.$get();
		}
		return v.scalar;
	};
	Value.prototype.Bool = function() { return this.$val.Bool(); };
	Value.Ptr.prototype.Bytes = function() {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBe(23);
		if (!((v.typ.Elem().Kind() === 8))) {
			$panic(new $String("reflect.Value.Bytes of non-byte slice"));
		}
		return v.ptr.$get();
	};
	Value.prototype.Bytes = function() { return this.$val.Bytes(); };
	Value.Ptr.prototype.runes = function() {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBe(23);
		if (!((v.typ.Elem().Kind() === 5))) {
			$panic(new $String("reflect.Value.Bytes of non-rune slice"));
		}
		return v.ptr.$get();
	};
	Value.prototype.runes = function() { return this.$val.runes(); };
	Value.Ptr.prototype.CanAddr = function() {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		return !((((v.flag & 4) >>> 0) === 0));
	};
	Value.prototype.CanAddr = function() { return this.$val.CanAddr(); };
	Value.Ptr.prototype.CanSet = function() {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		return ((v.flag & 5) >>> 0) === 4;
	};
	Value.prototype.CanSet = function() { return this.$val.CanSet(); };
	Value.Ptr.prototype.Call = function(in$1) {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBe(19);
		(new flag(v.flag)).mustBeExported();
		return v.call("Call", in$1);
	};
	Value.prototype.Call = function(in$1) { return this.$val.Call(in$1); };
	Value.Ptr.prototype.CallSlice = function(in$1) {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBe(19);
		(new flag(v.flag)).mustBeExported();
		return v.call("CallSlice", in$1);
	};
	Value.prototype.CallSlice = function(in$1) { return this.$val.CallSlice(in$1); };
	Value.Ptr.prototype.Close = function() {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBe(18);
		(new flag(v.flag)).mustBeExported();
		chanclose(v.pointer());
	};
	Value.prototype.Close = function() { return this.$val.Close(); };
	Value.Ptr.prototype.Complex = function() {
		var v, k, _ref, x$1, x$2;
		v = new Value.Ptr(); $copy(v, this, Value);
		k = (new flag(v.flag)).kind();
		_ref = k;
		if (_ref === 15) {
			if (!((((v.flag & 2) >>> 0) === 0))) {
				return (x$1 = v.ptr.$get(), new $Complex128(x$1.$real, x$1.$imag));
			}
			return (x$2 = v.scalar, new $Complex128(x$2.$real, x$2.$imag));
		} else if (_ref === 16) {
			return v.ptr.$get();
		}
		$panic(new ValueError.Ptr("reflect.Value.Complex", k));
	};
	Value.prototype.Complex = function() { return this.$val.Complex(); };
	Value.Ptr.prototype.FieldByIndex = function(index) {
		var v, _ref, _i, i, x$1;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBe(25);
		_ref = index;
		_i = 0;
		while (_i < _ref.$length) {
			i = _i;
			x$1 = ((_i < 0 || _i >= _ref.$length) ? $throwRuntimeError("index out of range") : _ref.$array[_ref.$offset + _i]);
			if (i > 0) {
				if ((v.Kind() === 22) && (v.typ.Elem().Kind() === 25)) {
					if (v.IsNil()) {
						$panic(new $String("reflect: indirection through nil pointer to embedded struct"));
					}
					$copy(v, v.Elem(), Value);
				}
			}
			$copy(v, v.Field(x$1), Value);
			_i++;
		}
		return v;
	};
	Value.prototype.FieldByIndex = function(index) { return this.$val.FieldByIndex(index); };
	Value.Ptr.prototype.FieldByName = function(name) {
		var v, _tuple, f, ok;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBe(25);
		_tuple = v.typ.FieldByName(name); f = new StructField.Ptr(); $copy(f, _tuple[0], StructField); ok = _tuple[1];
		if (ok) {
			return v.FieldByIndex(f.Index);
		}
		return new Value.Ptr(($ptrType(rtype)).nil, 0, 0, 0);
	};
	Value.prototype.FieldByName = function(name) { return this.$val.FieldByName(name); };
	Value.Ptr.prototype.FieldByNameFunc = function(match) {
		var v, _tuple, f, ok;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBe(25);
		_tuple = v.typ.FieldByNameFunc(match); f = new StructField.Ptr(); $copy(f, _tuple[0], StructField); ok = _tuple[1];
		if (ok) {
			return v.FieldByIndex(f.Index);
		}
		return new Value.Ptr(($ptrType(rtype)).nil, 0, 0, 0);
	};
	Value.prototype.FieldByNameFunc = function(match) { return this.$val.FieldByNameFunc(match); };
	Value.Ptr.prototype.Float = function() {
		var v, k, _ref;
		v = new Value.Ptr(); $copy(v, this, Value);
		k = (new flag(v.flag)).kind();
		_ref = k;
		if (_ref === 13) {
			if (!((((v.flag & 2) >>> 0) === 0))) {
				return $coerceFloat32(v.ptr.$get());
			}
			return $coerceFloat32(v.scalar);
		} else if (_ref === 14) {
			if (!((((v.flag & 2) >>> 0) === 0))) {
				return v.ptr.$get();
			}
			return v.scalar;
		}
		$panic(new ValueError.Ptr("reflect.Value.Float", k));
	};
	Value.prototype.Float = function() { return this.$val.Float(); };
	Value.Ptr.prototype.Int = function() {
		var v, k, p, _ref;
		v = new Value.Ptr(); $copy(v, this, Value);
		k = (new flag(v.flag)).kind();
		p = 0;
		if (!((((v.flag & 2) >>> 0) === 0))) {
			p = v.ptr;
		} else {
			p = new ($ptrType($Uintptr))(function() { return this.$target.scalar; }, function($v) { this.$target.scalar = $v; }, v);
		}
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
		$panic(new ValueError.Ptr("reflect.Value.Int", k));
	};
	Value.prototype.Int = function() { return this.$val.Int(); };
	Value.Ptr.prototype.CanInterface = function() {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		if (v.flag === 0) {
			$panic(new ValueError.Ptr("reflect.Value.CanInterface", 0));
		}
		return ((v.flag & 1) >>> 0) === 0;
	};
	Value.prototype.CanInterface = function() { return this.$val.CanInterface(); };
	Value.Ptr.prototype.Interface = function() {
		var i = null, v;
		v = new Value.Ptr(); $copy(v, this, Value);
		i = valueInterface($clone(v, Value), true);
		return i;
	};
	Value.prototype.Interface = function() { return this.$val.Interface(); };
	Value.Ptr.prototype.InterfaceData = function() {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBe(20);
		return v.ptr;
	};
	Value.prototype.InterfaceData = function() { return this.$val.InterfaceData(); };
	Value.Ptr.prototype.IsValid = function() {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		return !((v.flag === 0));
	};
	Value.prototype.IsValid = function() { return this.$val.IsValid(); };
	Value.Ptr.prototype.Kind = function() {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		return (new flag(v.flag)).kind();
	};
	Value.prototype.Kind = function() { return this.$val.Kind(); };
	Value.Ptr.prototype.MapIndex = function(key) {
		var v, tt, k, e, typ, fl, c;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBe(21);
		tt = v.typ.mapType;
		$copy(key, key.assignTo("reflect.Value.MapIndex", tt.key, ($ptrType($emptyInterface)).nil), Value);
		k = 0;
		if (!((((key.flag & 2) >>> 0) === 0))) {
			k = key.ptr;
		} else if (key.typ.pointers()) {
			k = new ($ptrType($UnsafePointer))(function() { return this.$target.ptr; }, function($v) { this.$target.ptr = $v; }, key);
		} else {
			k = new ($ptrType($Uintptr))(function() { return this.$target.scalar; }, function($v) { this.$target.scalar = $v; }, key);
		}
		e = mapaccess(v.typ, v.pointer(), k);
		if (e === 0) {
			return new Value.Ptr(($ptrType(rtype)).nil, 0, 0, 0);
		}
		typ = tt.elem;
		fl = ((((v.flag | key.flag) >>> 0)) & 1) >>> 0;
		fl = (fl | (((typ.Kind() >>> 0) << 4 >>> 0))) >>> 0;
		if (typ.size > 4) {
			c = unsafe_New(typ);
			memmove(c, e, typ.size);
			return new Value.Ptr(typ, c, 0, (fl | 2) >>> 0);
		} else if (typ.pointers()) {
			return new Value.Ptr(typ, e.$get(), 0, fl);
		} else {
			return new Value.Ptr(typ, 0, loadScalar(e, typ.size), fl);
		}
	};
	Value.prototype.MapIndex = function(key) { return this.$val.MapIndex(key); };
	Value.Ptr.prototype.MapKeys = function() {
		var v, tt, keyType, fl, m, mlen, it, a, i, key, c;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBe(21);
		tt = v.typ.mapType;
		keyType = tt.key;
		fl = (((v.flag & 1) >>> 0) | ((keyType.Kind() >>> 0) << 4 >>> 0)) >>> 0;
		m = v.pointer();
		mlen = 0;
		if (!(m === 0)) {
			mlen = maplen(m);
		}
		it = mapiterinit(v.typ, m);
		a = ($sliceType(Value)).make(mlen);
		i = 0;
		i = 0;
		while (i < a.$length) {
			key = mapiterkey(it);
			if (key === 0) {
				break;
			}
			if (keyType.size > 4) {
				c = unsafe_New(keyType);
				memmove(c, key, keyType.size);
				$copy(((i < 0 || i >= a.$length) ? $throwRuntimeError("index out of range") : a.$array[a.$offset + i]), new Value.Ptr(keyType, c, 0, (fl | 2) >>> 0), Value);
			} else if (keyType.pointers()) {
				$copy(((i < 0 || i >= a.$length) ? $throwRuntimeError("index out of range") : a.$array[a.$offset + i]), new Value.Ptr(keyType, key.$get(), 0, fl), Value);
			} else {
				$copy(((i < 0 || i >= a.$length) ? $throwRuntimeError("index out of range") : a.$array[a.$offset + i]), new Value.Ptr(keyType, 0, loadScalar(key, keyType.size), fl), Value);
			}
			mapiternext(it);
			i = i + (1) >> 0;
		}
		return $subslice(a, 0, i);
	};
	Value.prototype.MapKeys = function() { return this.$val.MapKeys(); };
	Value.Ptr.prototype.Method = function(i) {
		var v, fl;
		v = new Value.Ptr(); $copy(v, this, Value);
		if (v.typ === ($ptrType(rtype)).nil) {
			$panic(new ValueError.Ptr("reflect.Value.Method", 0));
		}
		if (!((((v.flag & 8) >>> 0) === 0)) || i < 0 || i >= v.typ.NumMethod()) {
			$panic(new $String("reflect: Method index out of range"));
		}
		if ((v.typ.Kind() === 20) && v.IsNil()) {
			$panic(new $String("reflect: Method on nil interface value"));
		}
		fl = (v.flag & 3) >>> 0;
		fl = (fl | (304)) >>> 0;
		fl = (fl | (((((i >>> 0) << 9 >>> 0) | 8) >>> 0))) >>> 0;
		return new Value.Ptr(v.typ, v.ptr, v.scalar, fl);
	};
	Value.prototype.Method = function(i) { return this.$val.Method(i); };
	Value.Ptr.prototype.NumMethod = function() {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		if (v.typ === ($ptrType(rtype)).nil) {
			$panic(new ValueError.Ptr("reflect.Value.NumMethod", 0));
		}
		if (!((((v.flag & 8) >>> 0) === 0))) {
			return 0;
		}
		return v.typ.NumMethod();
	};
	Value.prototype.NumMethod = function() { return this.$val.NumMethod(); };
	Value.Ptr.prototype.MethodByName = function(name) {
		var v, _tuple, m, ok;
		v = new Value.Ptr(); $copy(v, this, Value);
		if (v.typ === ($ptrType(rtype)).nil) {
			$panic(new ValueError.Ptr("reflect.Value.MethodByName", 0));
		}
		if (!((((v.flag & 8) >>> 0) === 0))) {
			return new Value.Ptr(($ptrType(rtype)).nil, 0, 0, 0);
		}
		_tuple = v.typ.MethodByName(name); m = new Method.Ptr(); $copy(m, _tuple[0], Method); ok = _tuple[1];
		if (!ok) {
			return new Value.Ptr(($ptrType(rtype)).nil, 0, 0, 0);
		}
		return v.Method(m.Index);
	};
	Value.prototype.MethodByName = function(name) { return this.$val.MethodByName(name); };
	Value.Ptr.prototype.NumField = function() {
		var v, tt;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBe(25);
		tt = v.typ.structType;
		return tt.fields.$length;
	};
	Value.prototype.NumField = function() { return this.$val.NumField(); };
	Value.Ptr.prototype.OverflowComplex = function(x$1) {
		var v, k, _ref;
		v = new Value.Ptr(); $copy(v, this, Value);
		k = (new flag(v.flag)).kind();
		_ref = k;
		if (_ref === 15) {
			return overflowFloat32(x$1.$real) || overflowFloat32(x$1.$imag);
		} else if (_ref === 16) {
			return false;
		}
		$panic(new ValueError.Ptr("reflect.Value.OverflowComplex", k));
	};
	Value.prototype.OverflowComplex = function(x$1) { return this.$val.OverflowComplex(x$1); };
	Value.Ptr.prototype.OverflowFloat = function(x$1) {
		var v, k, _ref;
		v = new Value.Ptr(); $copy(v, this, Value);
		k = (new flag(v.flag)).kind();
		_ref = k;
		if (_ref === 13) {
			return overflowFloat32(x$1);
		} else if (_ref === 14) {
			return false;
		}
		$panic(new ValueError.Ptr("reflect.Value.OverflowFloat", k));
	};
	Value.prototype.OverflowFloat = function(x$1) { return this.$val.OverflowFloat(x$1); };
	overflowFloat32 = function(x$1) {
		if (x$1 < 0) {
			x$1 = -x$1;
		}
		return 3.4028234663852886e+38 < x$1 && x$1 <= 1.7976931348623157e+308;
	};
	Value.Ptr.prototype.OverflowInt = function(x$1) {
		var v, k, _ref, x$2, bitSize, trunc;
		v = new Value.Ptr(); $copy(v, this, Value);
		k = (new flag(v.flag)).kind();
		_ref = k;
		if (_ref === 2 || _ref === 3 || _ref === 4 || _ref === 5 || _ref === 6) {
			bitSize = (x$2 = v.typ.size, (((x$2 >>> 16 << 16) * 8 >>> 0) + (x$2 << 16 >>> 16) * 8) >>> 0);
			trunc = $shiftRightInt64(($shiftLeft64(x$1, ((64 - bitSize >>> 0)))), ((64 - bitSize >>> 0)));
			return !((x$1.$high === trunc.$high && x$1.$low === trunc.$low));
		}
		$panic(new ValueError.Ptr("reflect.Value.OverflowInt", k));
	};
	Value.prototype.OverflowInt = function(x$1) { return this.$val.OverflowInt(x$1); };
	Value.Ptr.prototype.OverflowUint = function(x$1) {
		var v, k, _ref, x$2, bitSize, trunc;
		v = new Value.Ptr(); $copy(v, this, Value);
		k = (new flag(v.flag)).kind();
		_ref = k;
		if (_ref === 7 || _ref === 12 || _ref === 8 || _ref === 9 || _ref === 10 || _ref === 11) {
			bitSize = (x$2 = v.typ.size, (((x$2 >>> 16 << 16) * 8 >>> 0) + (x$2 << 16 >>> 16) * 8) >>> 0);
			trunc = $shiftRightUint64(($shiftLeft64(x$1, ((64 - bitSize >>> 0)))), ((64 - bitSize >>> 0)));
			return !((x$1.$high === trunc.$high && x$1.$low === trunc.$low));
		}
		$panic(new ValueError.Ptr("reflect.Value.OverflowUint", k));
	};
	Value.prototype.OverflowUint = function(x$1) { return this.$val.OverflowUint(x$1); };
	Value.Ptr.prototype.Recv = function() {
		var x$1 = new Value.Ptr(), ok = false, v, _tuple;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBe(18);
		(new flag(v.flag)).mustBeExported();
		_tuple = v.recv(false); $copy(x$1, _tuple[0], Value); ok = _tuple[1];
		return [x$1, ok];
	};
	Value.prototype.Recv = function() { return this.$val.Recv(); };
	Value.Ptr.prototype.recv = function(nb) {
		var val = new Value.Ptr(), ok = false, v, tt, t, p, _tuple, selected;
		v = new Value.Ptr(); $copy(v, this, Value);
		tt = v.typ.chanType;
		if (((tt.dir >> 0) & 1) === 0) {
			$panic(new $String("reflect: recv on send-only channel"));
		}
		t = tt.elem;
		$copy(val, new Value.Ptr(t, 0, 0, (t.Kind() >>> 0) << 4 >>> 0), Value);
		p = 0;
		if (t.size > 4) {
			p = unsafe_New(t);
			val.ptr = p;
			val.flag = (val.flag | (2)) >>> 0;
		} else if (t.pointers()) {
			p = new ($ptrType($UnsafePointer))(function() { return this.$target.ptr; }, function($v) { this.$target.ptr = $v; }, val);
		} else {
			p = new ($ptrType($Uintptr))(function() { return this.$target.scalar; }, function($v) { this.$target.scalar = $v; }, val);
		}
		_tuple = chanrecv(v.typ, v.pointer(), nb, p); selected = _tuple[0]; ok = _tuple[1];
		if (!selected) {
			$copy(val, new Value.Ptr(($ptrType(rtype)).nil, 0, 0, 0), Value);
		}
		return [val, ok];
	};
	Value.prototype.recv = function(nb) { return this.$val.recv(nb); };
	Value.Ptr.prototype.Send = function(x$1) {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBe(18);
		(new flag(v.flag)).mustBeExported();
		v.send($clone(x$1, Value), false);
	};
	Value.prototype.Send = function(x$1) { return this.$val.Send(x$1); };
	Value.Ptr.prototype.send = function(x$1, nb) {
		var selected = false, v, tt, p;
		v = new Value.Ptr(); $copy(v, this, Value);
		tt = v.typ.chanType;
		if (((tt.dir >> 0) & 2) === 0) {
			$panic(new $String("reflect: send on recv-only channel"));
		}
		(new flag(x$1.flag)).mustBeExported();
		$copy(x$1, x$1.assignTo("reflect.Value.Send", tt.elem, ($ptrType($emptyInterface)).nil), Value);
		p = 0;
		if (!((((x$1.flag & 2) >>> 0) === 0))) {
			p = x$1.ptr;
		} else if (x$1.typ.pointers()) {
			p = new ($ptrType($UnsafePointer))(function() { return this.$target.ptr; }, function($v) { this.$target.ptr = $v; }, x$1);
		} else {
			p = new ($ptrType($Uintptr))(function() { return this.$target.scalar; }, function($v) { this.$target.scalar = $v; }, x$1);
		}
		selected = chansend(v.typ, v.pointer(), p, nb);
		return selected;
	};
	Value.prototype.send = function(x$1, nb) { return this.$val.send(x$1, nb); };
	Value.Ptr.prototype.SetBool = function(x$1) {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBeAssignable();
		(new flag(v.flag)).mustBe(1);
		v.ptr.$set(x$1);
	};
	Value.prototype.SetBool = function(x$1) { return this.$val.SetBool(x$1); };
	Value.Ptr.prototype.SetBytes = function(x$1) {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBeAssignable();
		(new flag(v.flag)).mustBe(23);
		if (!((v.typ.Elem().Kind() === 8))) {
			$panic(new $String("reflect.Value.SetBytes of non-byte slice"));
		}
		v.ptr.$set(x$1);
	};
	Value.prototype.SetBytes = function(x$1) { return this.$val.SetBytes(x$1); };
	Value.Ptr.prototype.setRunes = function(x$1) {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBeAssignable();
		(new flag(v.flag)).mustBe(23);
		if (!((v.typ.Elem().Kind() === 5))) {
			$panic(new $String("reflect.Value.setRunes of non-rune slice"));
		}
		v.ptr.$set(x$1);
	};
	Value.prototype.setRunes = function(x$1) { return this.$val.setRunes(x$1); };
	Value.Ptr.prototype.SetComplex = function(x$1) {
		var v, k, _ref;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBeAssignable();
		k = (new flag(v.flag)).kind();
		_ref = k;
		if (_ref === 15) {
			v.ptr.$set(new $Complex64(x$1.$real, x$1.$imag));
		} else if (_ref === 16) {
			v.ptr.$set(x$1);
		} else {
			$panic(new ValueError.Ptr("reflect.Value.SetComplex", k));
		}
	};
	Value.prototype.SetComplex = function(x$1) { return this.$val.SetComplex(x$1); };
	Value.Ptr.prototype.SetFloat = function(x$1) {
		var v, k, _ref;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBeAssignable();
		k = (new flag(v.flag)).kind();
		_ref = k;
		if (_ref === 13) {
			v.ptr.$set(x$1);
		} else if (_ref === 14) {
			v.ptr.$set(x$1);
		} else {
			$panic(new ValueError.Ptr("reflect.Value.SetFloat", k));
		}
	};
	Value.prototype.SetFloat = function(x$1) { return this.$val.SetFloat(x$1); };
	Value.Ptr.prototype.SetInt = function(x$1) {
		var v, k, _ref;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBeAssignable();
		k = (new flag(v.flag)).kind();
		_ref = k;
		if (_ref === 2) {
			v.ptr.$set(((x$1.$low + ((x$1.$high >> 31) * 4294967296)) >> 0));
		} else if (_ref === 3) {
			v.ptr.$set(((x$1.$low + ((x$1.$high >> 31) * 4294967296)) << 24 >> 24));
		} else if (_ref === 4) {
			v.ptr.$set(((x$1.$low + ((x$1.$high >> 31) * 4294967296)) << 16 >> 16));
		} else if (_ref === 5) {
			v.ptr.$set(((x$1.$low + ((x$1.$high >> 31) * 4294967296)) >> 0));
		} else if (_ref === 6) {
			v.ptr.$set(x$1);
		} else {
			$panic(new ValueError.Ptr("reflect.Value.SetInt", k));
		}
	};
	Value.prototype.SetInt = function(x$1) { return this.$val.SetInt(x$1); };
	Value.Ptr.prototype.SetMapIndex = function(key, val) {
		var v, tt, k, e;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBe(21);
		(new flag(v.flag)).mustBeExported();
		(new flag(key.flag)).mustBeExported();
		tt = v.typ.mapType;
		$copy(key, key.assignTo("reflect.Value.SetMapIndex", tt.key, ($ptrType($emptyInterface)).nil), Value);
		k = 0;
		if (!((((key.flag & 2) >>> 0) === 0))) {
			k = key.ptr;
		} else if (key.typ.pointers()) {
			k = new ($ptrType($UnsafePointer))(function() { return this.$target.ptr; }, function($v) { this.$target.ptr = $v; }, key);
		} else {
			k = new ($ptrType($Uintptr))(function() { return this.$target.scalar; }, function($v) { this.$target.scalar = $v; }, key);
		}
		if (val.typ === ($ptrType(rtype)).nil) {
			mapdelete(v.typ, v.pointer(), k);
			return;
		}
		(new flag(val.flag)).mustBeExported();
		$copy(val, val.assignTo("reflect.Value.SetMapIndex", tt.elem, ($ptrType($emptyInterface)).nil), Value);
		e = 0;
		if (!((((val.flag & 2) >>> 0) === 0))) {
			e = val.ptr;
		} else if (val.typ.pointers()) {
			e = new ($ptrType($UnsafePointer))(function() { return this.$target.ptr; }, function($v) { this.$target.ptr = $v; }, val);
		} else {
			e = new ($ptrType($Uintptr))(function() { return this.$target.scalar; }, function($v) { this.$target.scalar = $v; }, val);
		}
		mapassign(v.typ, v.pointer(), k, e);
	};
	Value.prototype.SetMapIndex = function(key, val) { return this.$val.SetMapIndex(key, val); };
	Value.Ptr.prototype.SetUint = function(x$1) {
		var v, k, _ref;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBeAssignable();
		k = (new flag(v.flag)).kind();
		_ref = k;
		if (_ref === 7) {
			v.ptr.$set((x$1.$low >>> 0));
		} else if (_ref === 8) {
			v.ptr.$set((x$1.$low << 24 >>> 24));
		} else if (_ref === 9) {
			v.ptr.$set((x$1.$low << 16 >>> 16));
		} else if (_ref === 10) {
			v.ptr.$set((x$1.$low >>> 0));
		} else if (_ref === 11) {
			v.ptr.$set(x$1);
		} else if (_ref === 12) {
			v.ptr.$set((x$1.$low >>> 0));
		} else {
			$panic(new ValueError.Ptr("reflect.Value.SetUint", k));
		}
	};
	Value.prototype.SetUint = function(x$1) { return this.$val.SetUint(x$1); };
	Value.Ptr.prototype.SetPointer = function(x$1) {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBeAssignable();
		(new flag(v.flag)).mustBe(26);
		v.ptr.$set(x$1);
	};
	Value.prototype.SetPointer = function(x$1) { return this.$val.SetPointer(x$1); };
	Value.Ptr.prototype.SetString = function(x$1) {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBeAssignable();
		(new flag(v.flag)).mustBe(24);
		v.ptr.$set(x$1);
	};
	Value.prototype.SetString = function(x$1) { return this.$val.SetString(x$1); };
	Value.Ptr.prototype.String = function() {
		var v, k, _ref;
		v = new Value.Ptr(); $copy(v, this, Value);
		k = (new flag(v.flag)).kind();
		_ref = k;
		if (_ref === 0) {
			return "<invalid Value>";
		} else if (_ref === 24) {
			return v.ptr.$get();
		}
		return "<" + v.typ.String() + " Value>";
	};
	Value.prototype.String = function() { return this.$val.String(); };
	Value.Ptr.prototype.TryRecv = function() {
		var x$1 = new Value.Ptr(), ok = false, v, _tuple;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBe(18);
		(new flag(v.flag)).mustBeExported();
		_tuple = v.recv(true); $copy(x$1, _tuple[0], Value); ok = _tuple[1];
		return [x$1, ok];
	};
	Value.prototype.TryRecv = function() { return this.$val.TryRecv(); };
	Value.Ptr.prototype.TrySend = function(x$1) {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBe(18);
		(new flag(v.flag)).mustBeExported();
		return v.send($clone(x$1, Value), true);
	};
	Value.prototype.TrySend = function(x$1) { return this.$val.TrySend(x$1); };
	Value.Ptr.prototype.Type = function() {
		var v, f, i, tt, x$1, m, ut, x$2, m$1;
		v = new Value.Ptr(); $copy(v, this, Value);
		f = v.flag;
		if (f === 0) {
			$panic(new ValueError.Ptr("reflect.Value.Type", 0));
		}
		if (((f & 8) >>> 0) === 0) {
			return v.typ;
		}
		i = (v.flag >> 0) >> 9 >> 0;
		if (v.typ.Kind() === 20) {
			tt = v.typ.interfaceType;
			if (i < 0 || i >= tt.methods.$length) {
				$panic(new $String("reflect: internal error: invalid method index"));
			}
			m = (x$1 = tt.methods, ((i < 0 || i >= x$1.$length) ? $throwRuntimeError("index out of range") : x$1.$array[x$1.$offset + i]));
			return m.typ;
		}
		ut = v.typ.uncommonType.uncommon();
		if (ut === ($ptrType(uncommonType)).nil || i < 0 || i >= ut.methods.$length) {
			$panic(new $String("reflect: internal error: invalid method index"));
		}
		m$1 = (x$2 = ut.methods, ((i < 0 || i >= x$2.$length) ? $throwRuntimeError("index out of range") : x$2.$array[x$2.$offset + i]));
		return m$1.mtyp;
	};
	Value.prototype.Type = function() { return this.$val.Type(); };
	Value.Ptr.prototype.Uint = function() {
		var v, k, p, _ref, x$1;
		v = new Value.Ptr(); $copy(v, this, Value);
		k = (new flag(v.flag)).kind();
		p = 0;
		if (!((((v.flag & 2) >>> 0) === 0))) {
			p = v.ptr;
		} else {
			p = new ($ptrType($Uintptr))(function() { return this.$target.scalar; }, function($v) { this.$target.scalar = $v; }, v);
		}
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
			return (x$1 = p.$get(), new $Uint64(0, x$1.constructor === Number ? x$1 : 1));
		}
		$panic(new ValueError.Ptr("reflect.Value.Uint", k));
	};
	Value.prototype.Uint = function() { return this.$val.Uint(); };
	Value.Ptr.prototype.UnsafeAddr = function() {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		if (v.typ === ($ptrType(rtype)).nil) {
			$panic(new ValueError.Ptr("reflect.Value.UnsafeAddr", 0));
		}
		if (((v.flag & 4) >>> 0) === 0) {
			$panic(new $String("reflect.Value.UnsafeAddr of unaddressable value"));
		}
		return v.ptr;
	};
	Value.prototype.UnsafeAddr = function() { return this.$val.UnsafeAddr(); };
	New = $pkg.New = function(typ) {
		var ptr, fl;
		if ($interfaceIsEqual(typ, null)) {
			$panic(new $String("reflect: New(nil)"));
		}
		ptr = unsafe_New((typ !== null && typ.constructor === ($ptrType(rtype)) ? typ.$val : $typeAssertionFailed(typ, ($ptrType(rtype)))));
		fl = 352;
		return new Value.Ptr(typ.common().ptrTo(), ptr, 0, fl);
	};
	Value.Ptr.prototype.assignTo = function(context, dst, target) {
		var v, fl, x$1;
		v = new Value.Ptr(); $copy(v, this, Value);
		if (!((((v.flag & 8) >>> 0) === 0))) {
			$copy(v, makeMethodValue(context, $clone(v, Value)), Value);
		}
		if (directlyAssignable(dst, v.typ)) {
			v.typ = dst;
			fl = (v.flag & 7) >>> 0;
			fl = (fl | (((dst.Kind() >>> 0) << 4 >>> 0))) >>> 0;
			return new Value.Ptr(dst, v.ptr, v.scalar, fl);
		} else if (implements$1(dst, v.typ)) {
			if (target === ($ptrType($emptyInterface)).nil) {
				target = $newDataPointer(null, ($ptrType($emptyInterface)));
			}
			x$1 = valueInterface($clone(v, Value), false);
			if (dst.NumMethod() === 0) {
				target.$set(x$1);
			} else {
				ifaceE2I(dst, x$1, target);
			}
			return new Value.Ptr(dst, target, 0, 322);
		}
		$panic(new $String(context + ": value of type " + v.typ.String() + " is not assignable to type " + dst.String()));
	};
	Value.prototype.assignTo = function(context, dst, target) { return this.$val.assignTo(context, dst, target); };
	Value.Ptr.prototype.Convert = function(t) {
		var v, op;
		v = new Value.Ptr(); $copy(v, this, Value);
		if (!((((v.flag & 8) >>> 0) === 0))) {
			$copy(v, makeMethodValue("Convert", $clone(v, Value)), Value);
		}
		op = convertOp(t.common(), v.typ);
		if (op === $throwNilPointerError) {
			$panic(new $String("reflect.Value.Convert: value of type " + v.typ.String() + " cannot be converted to type " + t.String()));
		}
		return op($clone(v, Value), t);
	};
	Value.prototype.Convert = function(t) { return this.$val.Convert(t); };
	convertOp = function(dst, src) {
		var _ref, _ref$1, _ref$2, _ref$3, _ref$4, _ref$5, _ref$6;
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
		var typ, ptr, s, _ref;
		typ = t.common();
		if (typ.size > 4) {
			ptr = unsafe_New(typ);
			ptr.$set(v);
			return new Value.Ptr(typ, ptr, 0, (((f | 2) >>> 0) | ((typ.Kind() >>> 0) << 4 >>> 0)) >>> 0);
		}
		s = 0;
		_ref = typ.size;
		if (_ref === 4) {
			new ($ptrType($Uintptr))(function() { return s; }, function($v) { s = $v; }).$set(v);
		} else if (_ref === 8) {
			new ($ptrType($Uintptr))(function() { return s; }, function($v) { s = $v; }).$set(v);
		}
		return new Value.Ptr(typ, 0, s, (f | ((typ.Kind() >>> 0) << 4 >>> 0)) >>> 0);
	};
	makeComplex = function(f, v, t) {
		var typ, ptr, _ref, s;
		typ = t.common();
		if (typ.size > 4) {
			ptr = unsafe_New(typ);
			_ref = typ.size;
			if (_ref === 8) {
				ptr.$set(new $Complex64(v.$real, v.$imag));
			} else if (_ref === 16) {
				ptr.$set(v);
			}
			return new Value.Ptr(typ, ptr, 0, (((f | 2) >>> 0) | ((typ.Kind() >>> 0) << 4 >>> 0)) >>> 0);
		}
		s = 0;
		new ($ptrType($Uintptr))(function() { return s; }, function($v) { s = $v; }).$set(new $Complex64(v.$real, v.$imag));
		return new Value.Ptr(typ, 0, s, (f | ((typ.Kind() >>> 0) << 4 >>> 0)) >>> 0);
	};
	makeString = function(f, v, t) {
		var ret;
		ret = new Value.Ptr(); $copy(ret, New(t).Elem(), Value);
		ret.SetString(v);
		ret.flag = ((ret.flag & ~4) | f) >>> 0;
		return ret;
	};
	makeBytes = function(f, v, t) {
		var ret;
		ret = new Value.Ptr(); $copy(ret, New(t).Elem(), Value);
		ret.SetBytes(v);
		ret.flag = ((ret.flag & ~4) | f) >>> 0;
		return ret;
	};
	makeRunes = function(f, v, t) {
		var ret;
		ret = new Value.Ptr(); $copy(ret, New(t).Elem(), Value);
		ret.setRunes(v);
		ret.flag = ((ret.flag & ~4) | f) >>> 0;
		return ret;
	};
	cvtInt = function(v, t) {
		var x$1;
		return makeInt((v.flag & 1) >>> 0, (x$1 = v.Int(), new $Uint64(x$1.$high, x$1.$low)), t);
	};
	cvtUint = function(v, t) {
		return makeInt((v.flag & 1) >>> 0, v.Uint(), t);
	};
	cvtFloatInt = function(v, t) {
		var x$1;
		return makeInt((v.flag & 1) >>> 0, (x$1 = new $Int64(0, v.Float()), new $Uint64(x$1.$high, x$1.$low)), t);
	};
	cvtFloatUint = function(v, t) {
		return makeInt((v.flag & 1) >>> 0, new $Uint64(0, v.Float()), t);
	};
	cvtIntFloat = function(v, t) {
		return makeFloat((v.flag & 1) >>> 0, $flatten64(v.Int()), t);
	};
	cvtUintFloat = function(v, t) {
		return makeFloat((v.flag & 1) >>> 0, $flatten64(v.Uint()), t);
	};
	cvtFloat = function(v, t) {
		return makeFloat((v.flag & 1) >>> 0, v.Float(), t);
	};
	cvtComplex = function(v, t) {
		return makeComplex((v.flag & 1) >>> 0, v.Complex(), t);
	};
	cvtIntString = function(v, t) {
		return makeString((v.flag & 1) >>> 0, $encodeRune(v.Int().$low), t);
	};
	cvtUintString = function(v, t) {
		return makeString((v.flag & 1) >>> 0, $encodeRune(v.Uint().$low), t);
	};
	cvtBytesString = function(v, t) {
		return makeString((v.flag & 1) >>> 0, $bytesToString(v.Bytes()), t);
	};
	cvtStringBytes = function(v, t) {
		return makeBytes((v.flag & 1) >>> 0, new ($sliceType($Uint8))($stringToBytes(v.String())), t);
	};
	cvtRunesString = function(v, t) {
		return makeString((v.flag & 1) >>> 0, $runesToString(v.runes()), t);
	};
	cvtStringRunes = function(v, t) {
		return makeRunes((v.flag & 1) >>> 0, new ($sliceType($Int32))($stringToRunes(v.String())), t);
	};
	cvtT2I = function(v, typ) {
		var target, x$1;
		target = $newDataPointer(null, ($ptrType($emptyInterface)));
		x$1 = valueInterface($clone(v, Value), false);
		if (typ.NumMethod() === 0) {
			target.$set(x$1);
		} else {
			ifaceE2I((typ !== null && typ.constructor === ($ptrType(rtype)) ? typ.$val : $typeAssertionFailed(typ, ($ptrType(rtype)))), x$1, target);
		}
		return new Value.Ptr(typ.common(), target, 0, (((((v.flag & 1) >>> 0) | 2) >>> 0) | 320) >>> 0);
	};
	cvtI2I = function(v, typ) {
		var ret;
		if (v.IsNil()) {
			ret = new Value.Ptr(); $copy(ret, Zero(typ), Value);
			ret.flag = (ret.flag | (((v.flag & 1) >>> 0))) >>> 0;
			return ret;
		}
		return cvtT2I($clone(v.Elem(), Value), typ);
	};
	call = function() {
		$panic("Native function not implemented: reflect.call");
	};
	$pkg.$init = function() {
		mapIter.init([["t", "t", "reflect", Type, ""], ["m", "m", "reflect", js.Object, ""], ["keys", "keys", "reflect", js.Object, ""], ["i", "i", "reflect", $Int, ""]]);
		Type.init([["Align", "Align", "", [], [$Int], false], ["AssignableTo", "AssignableTo", "", [Type], [$Bool], false], ["Bits", "Bits", "", [], [$Int], false], ["ChanDir", "ChanDir", "", [], [ChanDir], false], ["ConvertibleTo", "ConvertibleTo", "", [Type], [$Bool], false], ["Elem", "Elem", "", [], [Type], false], ["Field", "Field", "", [$Int], [StructField], false], ["FieldAlign", "FieldAlign", "", [], [$Int], false], ["FieldByIndex", "FieldByIndex", "", [($sliceType($Int))], [StructField], false], ["FieldByName", "FieldByName", "", [$String], [StructField, $Bool], false], ["FieldByNameFunc", "FieldByNameFunc", "", [($funcType([$String], [$Bool], false))], [StructField, $Bool], false], ["Implements", "Implements", "", [Type], [$Bool], false], ["In", "In", "", [$Int], [Type], false], ["IsVariadic", "IsVariadic", "", [], [$Bool], false], ["Key", "Key", "", [], [Type], false], ["Kind", "Kind", "", [], [Kind], false], ["Len", "Len", "", [], [$Int], false], ["Method", "Method", "", [$Int], [Method], false], ["MethodByName", "MethodByName", "", [$String], [Method, $Bool], false], ["Name", "Name", "", [], [$String], false], ["NumField", "NumField", "", [], [$Int], false], ["NumIn", "NumIn", "", [], [$Int], false], ["NumMethod", "NumMethod", "", [], [$Int], false], ["NumOut", "NumOut", "", [], [$Int], false], ["Out", "Out", "", [$Int], [Type], false], ["PkgPath", "PkgPath", "", [], [$String], false], ["Size", "Size", "", [], [$Uintptr], false], ["String", "String", "", [], [$String], false], ["common", "common", "reflect", [], [($ptrType(rtype))], false], ["uncommon", "uncommon", "reflect", [], [($ptrType(uncommonType))], false]]);
		Kind.methods = [["String", "String", "", [], [$String], false, -1]];
		($ptrType(Kind)).methods = [["String", "String", "", [], [$String], false, -1]];
		rtype.methods = [["uncommon", "uncommon", "reflect", [], [($ptrType(uncommonType))], false, 9]];
		($ptrType(rtype)).methods = [["Align", "Align", "", [], [$Int], false, -1], ["AssignableTo", "AssignableTo", "", [Type], [$Bool], false, -1], ["Bits", "Bits", "", [], [$Int], false, -1], ["ChanDir", "ChanDir", "", [], [ChanDir], false, -1], ["ConvertibleTo", "ConvertibleTo", "", [Type], [$Bool], false, -1], ["Elem", "Elem", "", [], [Type], false, -1], ["Field", "Field", "", [$Int], [StructField], false, -1], ["FieldAlign", "FieldAlign", "", [], [$Int], false, -1], ["FieldByIndex", "FieldByIndex", "", [($sliceType($Int))], [StructField], false, -1], ["FieldByName", "FieldByName", "", [$String], [StructField, $Bool], false, -1], ["FieldByNameFunc", "FieldByNameFunc", "", [($funcType([$String], [$Bool], false))], [StructField, $Bool], false, -1], ["Implements", "Implements", "", [Type], [$Bool], false, -1], ["In", "In", "", [$Int], [Type], false, -1], ["IsVariadic", "IsVariadic", "", [], [$Bool], false, -1], ["Key", "Key", "", [], [Type], false, -1], ["Kind", "Kind", "", [], [Kind], false, -1], ["Len", "Len", "", [], [$Int], false, -1], ["Method", "Method", "", [$Int], [Method], false, -1], ["MethodByName", "MethodByName", "", [$String], [Method, $Bool], false, -1], ["Name", "Name", "", [], [$String], false, -1], ["NumField", "NumField", "", [], [$Int], false, -1], ["NumIn", "NumIn", "", [], [$Int], false, -1], ["NumMethod", "NumMethod", "", [], [$Int], false, -1], ["NumOut", "NumOut", "", [], [$Int], false, -1], ["Out", "Out", "", [$Int], [Type], false, -1], ["PkgPath", "PkgPath", "", [], [$String], false, -1], ["Size", "Size", "", [], [$Uintptr], false, -1], ["String", "String", "", [], [$String], false, -1], ["common", "common", "reflect", [], [($ptrType(rtype))], false, -1], ["pointers", "pointers", "reflect", [], [$Bool], false, -1], ["ptrTo", "ptrTo", "reflect", [], [($ptrType(rtype))], false, -1], ["uncommon", "uncommon", "reflect", [], [($ptrType(uncommonType))], false, 9]];
		rtype.init([["size", "size", "reflect", $Uintptr, ""], ["hash", "hash", "reflect", $Uint32, ""], ["_$2", "_", "reflect", $Uint8, ""], ["align", "align", "reflect", $Uint8, ""], ["fieldAlign", "fieldAlign", "reflect", $Uint8, ""], ["kind", "kind", "reflect", $Uint8, ""], ["alg", "alg", "reflect", ($ptrType($Uintptr)), ""], ["gc", "gc", "reflect", $UnsafePointer, ""], ["string", "string", "reflect", ($ptrType($String)), ""], ["uncommonType", "", "reflect", ($ptrType(uncommonType)), ""], ["ptrToThis", "ptrToThis", "reflect", ($ptrType(rtype)), ""], ["zero", "zero", "reflect", $UnsafePointer, ""]]);
		method.init([["name", "name", "reflect", ($ptrType($String)), ""], ["pkgPath", "pkgPath", "reflect", ($ptrType($String)), ""], ["mtyp", "mtyp", "reflect", ($ptrType(rtype)), ""], ["typ", "typ", "reflect", ($ptrType(rtype)), ""], ["ifn", "ifn", "reflect", $UnsafePointer, ""], ["tfn", "tfn", "reflect", $UnsafePointer, ""]]);
		($ptrType(uncommonType)).methods = [["Method", "Method", "", [$Int], [Method], false, -1], ["MethodByName", "MethodByName", "", [$String], [Method, $Bool], false, -1], ["Name", "Name", "", [], [$String], false, -1], ["NumMethod", "NumMethod", "", [], [$Int], false, -1], ["PkgPath", "PkgPath", "", [], [$String], false, -1], ["uncommon", "uncommon", "reflect", [], [($ptrType(uncommonType))], false, -1]];
		uncommonType.init([["name", "name", "reflect", ($ptrType($String)), ""], ["pkgPath", "pkgPath", "reflect", ($ptrType($String)), ""], ["methods", "methods", "reflect", ($sliceType(method)), ""]]);
		ChanDir.methods = [["String", "String", "", [], [$String], false, -1]];
		($ptrType(ChanDir)).methods = [["String", "String", "", [], [$String], false, -1]];
		arrayType.methods = [["uncommon", "uncommon", "reflect", [], [($ptrType(uncommonType))], false, 0]];
		($ptrType(arrayType)).methods = [["Align", "Align", "", [], [$Int], false, 0], ["AssignableTo", "AssignableTo", "", [Type], [$Bool], false, 0], ["Bits", "Bits", "", [], [$Int], false, 0], ["ChanDir", "ChanDir", "", [], [ChanDir], false, 0], ["ConvertibleTo", "ConvertibleTo", "", [Type], [$Bool], false, 0], ["Elem", "Elem", "", [], [Type], false, 0], ["Field", "Field", "", [$Int], [StructField], false, 0], ["FieldAlign", "FieldAlign", "", [], [$Int], false, 0], ["FieldByIndex", "FieldByIndex", "", [($sliceType($Int))], [StructField], false, 0], ["FieldByName", "FieldByName", "", [$String], [StructField, $Bool], false, 0], ["FieldByNameFunc", "FieldByNameFunc", "", [($funcType([$String], [$Bool], false))], [StructField, $Bool], false, 0], ["Implements", "Implements", "", [Type], [$Bool], false, 0], ["In", "In", "", [$Int], [Type], false, 0], ["IsVariadic", "IsVariadic", "", [], [$Bool], false, 0], ["Key", "Key", "", [], [Type], false, 0], ["Kind", "Kind", "", [], [Kind], false, 0], ["Len", "Len", "", [], [$Int], false, 0], ["Method", "Method", "", [$Int], [Method], false, 0], ["MethodByName", "MethodByName", "", [$String], [Method, $Bool], false, 0], ["Name", "Name", "", [], [$String], false, 0], ["NumField", "NumField", "", [], [$Int], false, 0], ["NumIn", "NumIn", "", [], [$Int], false, 0], ["NumMethod", "NumMethod", "", [], [$Int], false, 0], ["NumOut", "NumOut", "", [], [$Int], false, 0], ["Out", "Out", "", [$Int], [Type], false, 0], ["PkgPath", "PkgPath", "", [], [$String], false, 0], ["Size", "Size", "", [], [$Uintptr], false, 0], ["String", "String", "", [], [$String], false, 0], ["common", "common", "reflect", [], [($ptrType(rtype))], false, 0], ["pointers", "pointers", "reflect", [], [$Bool], false, 0], ["ptrTo", "ptrTo", "reflect", [], [($ptrType(rtype))], false, 0], ["uncommon", "uncommon", "reflect", [], [($ptrType(uncommonType))], false, 0]];
		arrayType.init([["rtype", "", "reflect", rtype, "reflect:\"array\""], ["elem", "elem", "reflect", ($ptrType(rtype)), ""], ["slice", "slice", "reflect", ($ptrType(rtype)), ""], ["len", "len", "reflect", $Uintptr, ""]]);
		chanType.methods = [["uncommon", "uncommon", "reflect", [], [($ptrType(uncommonType))], false, 0]];
		($ptrType(chanType)).methods = [["Align", "Align", "", [], [$Int], false, 0], ["AssignableTo", "AssignableTo", "", [Type], [$Bool], false, 0], ["Bits", "Bits", "", [], [$Int], false, 0], ["ChanDir", "ChanDir", "", [], [ChanDir], false, 0], ["ConvertibleTo", "ConvertibleTo", "", [Type], [$Bool], false, 0], ["Elem", "Elem", "", [], [Type], false, 0], ["Field", "Field", "", [$Int], [StructField], false, 0], ["FieldAlign", "FieldAlign", "", [], [$Int], false, 0], ["FieldByIndex", "FieldByIndex", "", [($sliceType($Int))], [StructField], false, 0], ["FieldByName", "FieldByName", "", [$String], [StructField, $Bool], false, 0], ["FieldByNameFunc", "FieldByNameFunc", "", [($funcType([$String], [$Bool], false))], [StructField, $Bool], false, 0], ["Implements", "Implements", "", [Type], [$Bool], false, 0], ["In", "In", "", [$Int], [Type], false, 0], ["IsVariadic", "IsVariadic", "", [], [$Bool], false, 0], ["Key", "Key", "", [], [Type], false, 0], ["Kind", "Kind", "", [], [Kind], false, 0], ["Len", "Len", "", [], [$Int], false, 0], ["Method", "Method", "", [$Int], [Method], false, 0], ["MethodByName", "MethodByName", "", [$String], [Method, $Bool], false, 0], ["Name", "Name", "", [], [$String], false, 0], ["NumField", "NumField", "", [], [$Int], false, 0], ["NumIn", "NumIn", "", [], [$Int], false, 0], ["NumMethod", "NumMethod", "", [], [$Int], false, 0], ["NumOut", "NumOut", "", [], [$Int], false, 0], ["Out", "Out", "", [$Int], [Type], false, 0], ["PkgPath", "PkgPath", "", [], [$String], false, 0], ["Size", "Size", "", [], [$Uintptr], false, 0], ["String", "String", "", [], [$String], false, 0], ["common", "common", "reflect", [], [($ptrType(rtype))], false, 0], ["pointers", "pointers", "reflect", [], [$Bool], false, 0], ["ptrTo", "ptrTo", "reflect", [], [($ptrType(rtype))], false, 0], ["uncommon", "uncommon", "reflect", [], [($ptrType(uncommonType))], false, 0]];
		chanType.init([["rtype", "", "reflect", rtype, "reflect:\"chan\""], ["elem", "elem", "reflect", ($ptrType(rtype)), ""], ["dir", "dir", "reflect", $Uintptr, ""]]);
		funcType.methods = [["uncommon", "uncommon", "reflect", [], [($ptrType(uncommonType))], false, 0]];
		($ptrType(funcType)).methods = [["Align", "Align", "", [], [$Int], false, 0], ["AssignableTo", "AssignableTo", "", [Type], [$Bool], false, 0], ["Bits", "Bits", "", [], [$Int], false, 0], ["ChanDir", "ChanDir", "", [], [ChanDir], false, 0], ["ConvertibleTo", "ConvertibleTo", "", [Type], [$Bool], false, 0], ["Elem", "Elem", "", [], [Type], false, 0], ["Field", "Field", "", [$Int], [StructField], false, 0], ["FieldAlign", "FieldAlign", "", [], [$Int], false, 0], ["FieldByIndex", "FieldByIndex", "", [($sliceType($Int))], [StructField], false, 0], ["FieldByName", "FieldByName", "", [$String], [StructField, $Bool], false, 0], ["FieldByNameFunc", "FieldByNameFunc", "", [($funcType([$String], [$Bool], false))], [StructField, $Bool], false, 0], ["Implements", "Implements", "", [Type], [$Bool], false, 0], ["In", "In", "", [$Int], [Type], false, 0], ["IsVariadic", "IsVariadic", "", [], [$Bool], false, 0], ["Key", "Key", "", [], [Type], false, 0], ["Kind", "Kind", "", [], [Kind], false, 0], ["Len", "Len", "", [], [$Int], false, 0], ["Method", "Method", "", [$Int], [Method], false, 0], ["MethodByName", "MethodByName", "", [$String], [Method, $Bool], false, 0], ["Name", "Name", "", [], [$String], false, 0], ["NumField", "NumField", "", [], [$Int], false, 0], ["NumIn", "NumIn", "", [], [$Int], false, 0], ["NumMethod", "NumMethod", "", [], [$Int], false, 0], ["NumOut", "NumOut", "", [], [$Int], false, 0], ["Out", "Out", "", [$Int], [Type], false, 0], ["PkgPath", "PkgPath", "", [], [$String], false, 0], ["Size", "Size", "", [], [$Uintptr], false, 0], ["String", "String", "", [], [$String], false, 0], ["common", "common", "reflect", [], [($ptrType(rtype))], false, 0], ["pointers", "pointers", "reflect", [], [$Bool], false, 0], ["ptrTo", "ptrTo", "reflect", [], [($ptrType(rtype))], false, 0], ["uncommon", "uncommon", "reflect", [], [($ptrType(uncommonType))], false, 0]];
		funcType.init([["rtype", "", "reflect", rtype, "reflect:\"func\""], ["dotdotdot", "dotdotdot", "reflect", $Bool, ""], ["in$2", "in", "reflect", ($sliceType(($ptrType(rtype)))), ""], ["out", "out", "reflect", ($sliceType(($ptrType(rtype)))), ""]]);
		imethod.init([["name", "name", "reflect", ($ptrType($String)), ""], ["pkgPath", "pkgPath", "reflect", ($ptrType($String)), ""], ["typ", "typ", "reflect", ($ptrType(rtype)), ""]]);
		interfaceType.methods = [["uncommon", "uncommon", "reflect", [], [($ptrType(uncommonType))], false, 0]];
		($ptrType(interfaceType)).methods = [["Align", "Align", "", [], [$Int], false, 0], ["AssignableTo", "AssignableTo", "", [Type], [$Bool], false, 0], ["Bits", "Bits", "", [], [$Int], false, 0], ["ChanDir", "ChanDir", "", [], [ChanDir], false, 0], ["ConvertibleTo", "ConvertibleTo", "", [Type], [$Bool], false, 0], ["Elem", "Elem", "", [], [Type], false, 0], ["Field", "Field", "", [$Int], [StructField], false, 0], ["FieldAlign", "FieldAlign", "", [], [$Int], false, 0], ["FieldByIndex", "FieldByIndex", "", [($sliceType($Int))], [StructField], false, 0], ["FieldByName", "FieldByName", "", [$String], [StructField, $Bool], false, 0], ["FieldByNameFunc", "FieldByNameFunc", "", [($funcType([$String], [$Bool], false))], [StructField, $Bool], false, 0], ["Implements", "Implements", "", [Type], [$Bool], false, 0], ["In", "In", "", [$Int], [Type], false, 0], ["IsVariadic", "IsVariadic", "", [], [$Bool], false, 0], ["Key", "Key", "", [], [Type], false, 0], ["Kind", "Kind", "", [], [Kind], false, 0], ["Len", "Len", "", [], [$Int], false, 0], ["Method", "Method", "", [$Int], [Method], false, -1], ["MethodByName", "MethodByName", "", [$String], [Method, $Bool], false, -1], ["Name", "Name", "", [], [$String], false, 0], ["NumField", "NumField", "", [], [$Int], false, 0], ["NumIn", "NumIn", "", [], [$Int], false, 0], ["NumMethod", "NumMethod", "", [], [$Int], false, -1], ["NumOut", "NumOut", "", [], [$Int], false, 0], ["Out", "Out", "", [$Int], [Type], false, 0], ["PkgPath", "PkgPath", "", [], [$String], false, 0], ["Size", "Size", "", [], [$Uintptr], false, 0], ["String", "String", "", [], [$String], false, 0], ["common", "common", "reflect", [], [($ptrType(rtype))], false, 0], ["pointers", "pointers", "reflect", [], [$Bool], false, 0], ["ptrTo", "ptrTo", "reflect", [], [($ptrType(rtype))], false, 0], ["uncommon", "uncommon", "reflect", [], [($ptrType(uncommonType))], false, 0]];
		interfaceType.init([["rtype", "", "reflect", rtype, "reflect:\"interface\""], ["methods", "methods", "reflect", ($sliceType(imethod)), ""]]);
		mapType.methods = [["uncommon", "uncommon", "reflect", [], [($ptrType(uncommonType))], false, 0]];
		($ptrType(mapType)).methods = [["Align", "Align", "", [], [$Int], false, 0], ["AssignableTo", "AssignableTo", "", [Type], [$Bool], false, 0], ["Bits", "Bits", "", [], [$Int], false, 0], ["ChanDir", "ChanDir", "", [], [ChanDir], false, 0], ["ConvertibleTo", "ConvertibleTo", "", [Type], [$Bool], false, 0], ["Elem", "Elem", "", [], [Type], false, 0], ["Field", "Field", "", [$Int], [StructField], false, 0], ["FieldAlign", "FieldAlign", "", [], [$Int], false, 0], ["FieldByIndex", "FieldByIndex", "", [($sliceType($Int))], [StructField], false, 0], ["FieldByName", "FieldByName", "", [$String], [StructField, $Bool], false, 0], ["FieldByNameFunc", "FieldByNameFunc", "", [($funcType([$String], [$Bool], false))], [StructField, $Bool], false, 0], ["Implements", "Implements", "", [Type], [$Bool], false, 0], ["In", "In", "", [$Int], [Type], false, 0], ["IsVariadic", "IsVariadic", "", [], [$Bool], false, 0], ["Key", "Key", "", [], [Type], false, 0], ["Kind", "Kind", "", [], [Kind], false, 0], ["Len", "Len", "", [], [$Int], false, 0], ["Method", "Method", "", [$Int], [Method], false, 0], ["MethodByName", "MethodByName", "", [$String], [Method, $Bool], false, 0], ["Name", "Name", "", [], [$String], false, 0], ["NumField", "NumField", "", [], [$Int], false, 0], ["NumIn", "NumIn", "", [], [$Int], false, 0], ["NumMethod", "NumMethod", "", [], [$Int], false, 0], ["NumOut", "NumOut", "", [], [$Int], false, 0], ["Out", "Out", "", [$Int], [Type], false, 0], ["PkgPath", "PkgPath", "", [], [$String], false, 0], ["Size", "Size", "", [], [$Uintptr], false, 0], ["String", "String", "", [], [$String], false, 0], ["common", "common", "reflect", [], [($ptrType(rtype))], false, 0], ["pointers", "pointers", "reflect", [], [$Bool], false, 0], ["ptrTo", "ptrTo", "reflect", [], [($ptrType(rtype))], false, 0], ["uncommon", "uncommon", "reflect", [], [($ptrType(uncommonType))], false, 0]];
		mapType.init([["rtype", "", "reflect", rtype, "reflect:\"map\""], ["key", "key", "reflect", ($ptrType(rtype)), ""], ["elem", "elem", "reflect", ($ptrType(rtype)), ""], ["bucket", "bucket", "reflect", ($ptrType(rtype)), ""], ["hmap", "hmap", "reflect", ($ptrType(rtype)), ""]]);
		ptrType.methods = [["uncommon", "uncommon", "reflect", [], [($ptrType(uncommonType))], false, 0]];
		($ptrType(ptrType)).methods = [["Align", "Align", "", [], [$Int], false, 0], ["AssignableTo", "AssignableTo", "", [Type], [$Bool], false, 0], ["Bits", "Bits", "", [], [$Int], false, 0], ["ChanDir", "ChanDir", "", [], [ChanDir], false, 0], ["ConvertibleTo", "ConvertibleTo", "", [Type], [$Bool], false, 0], ["Elem", "Elem", "", [], [Type], false, 0], ["Field", "Field", "", [$Int], [StructField], false, 0], ["FieldAlign", "FieldAlign", "", [], [$Int], false, 0], ["FieldByIndex", "FieldByIndex", "", [($sliceType($Int))], [StructField], false, 0], ["FieldByName", "FieldByName", "", [$String], [StructField, $Bool], false, 0], ["FieldByNameFunc", "FieldByNameFunc", "", [($funcType([$String], [$Bool], false))], [StructField, $Bool], false, 0], ["Implements", "Implements", "", [Type], [$Bool], false, 0], ["In", "In", "", [$Int], [Type], false, 0], ["IsVariadic", "IsVariadic", "", [], [$Bool], false, 0], ["Key", "Key", "", [], [Type], false, 0], ["Kind", "Kind", "", [], [Kind], false, 0], ["Len", "Len", "", [], [$Int], false, 0], ["Method", "Method", "", [$Int], [Method], false, 0], ["MethodByName", "MethodByName", "", [$String], [Method, $Bool], false, 0], ["Name", "Name", "", [], [$String], false, 0], ["NumField", "NumField", "", [], [$Int], false, 0], ["NumIn", "NumIn", "", [], [$Int], false, 0], ["NumMethod", "NumMethod", "", [], [$Int], false, 0], ["NumOut", "NumOut", "", [], [$Int], false, 0], ["Out", "Out", "", [$Int], [Type], false, 0], ["PkgPath", "PkgPath", "", [], [$String], false, 0], ["Size", "Size", "", [], [$Uintptr], false, 0], ["String", "String", "", [], [$String], false, 0], ["common", "common", "reflect", [], [($ptrType(rtype))], false, 0], ["pointers", "pointers", "reflect", [], [$Bool], false, 0], ["ptrTo", "ptrTo", "reflect", [], [($ptrType(rtype))], false, 0], ["uncommon", "uncommon", "reflect", [], [($ptrType(uncommonType))], false, 0]];
		ptrType.init([["rtype", "", "reflect", rtype, "reflect:\"ptr\""], ["elem", "elem", "reflect", ($ptrType(rtype)), ""]]);
		sliceType.methods = [["uncommon", "uncommon", "reflect", [], [($ptrType(uncommonType))], false, 0]];
		($ptrType(sliceType)).methods = [["Align", "Align", "", [], [$Int], false, 0], ["AssignableTo", "AssignableTo", "", [Type], [$Bool], false, 0], ["Bits", "Bits", "", [], [$Int], false, 0], ["ChanDir", "ChanDir", "", [], [ChanDir], false, 0], ["ConvertibleTo", "ConvertibleTo", "", [Type], [$Bool], false, 0], ["Elem", "Elem", "", [], [Type], false, 0], ["Field", "Field", "", [$Int], [StructField], false, 0], ["FieldAlign", "FieldAlign", "", [], [$Int], false, 0], ["FieldByIndex", "FieldByIndex", "", [($sliceType($Int))], [StructField], false, 0], ["FieldByName", "FieldByName", "", [$String], [StructField, $Bool], false, 0], ["FieldByNameFunc", "FieldByNameFunc", "", [($funcType([$String], [$Bool], false))], [StructField, $Bool], false, 0], ["Implements", "Implements", "", [Type], [$Bool], false, 0], ["In", "In", "", [$Int], [Type], false, 0], ["IsVariadic", "IsVariadic", "", [], [$Bool], false, 0], ["Key", "Key", "", [], [Type], false, 0], ["Kind", "Kind", "", [], [Kind], false, 0], ["Len", "Len", "", [], [$Int], false, 0], ["Method", "Method", "", [$Int], [Method], false, 0], ["MethodByName", "MethodByName", "", [$String], [Method, $Bool], false, 0], ["Name", "Name", "", [], [$String], false, 0], ["NumField", "NumField", "", [], [$Int], false, 0], ["NumIn", "NumIn", "", [], [$Int], false, 0], ["NumMethod", "NumMethod", "", [], [$Int], false, 0], ["NumOut", "NumOut", "", [], [$Int], false, 0], ["Out", "Out", "", [$Int], [Type], false, 0], ["PkgPath", "PkgPath", "", [], [$String], false, 0], ["Size", "Size", "", [], [$Uintptr], false, 0], ["String", "String", "", [], [$String], false, 0], ["common", "common", "reflect", [], [($ptrType(rtype))], false, 0], ["pointers", "pointers", "reflect", [], [$Bool], false, 0], ["ptrTo", "ptrTo", "reflect", [], [($ptrType(rtype))], false, 0], ["uncommon", "uncommon", "reflect", [], [($ptrType(uncommonType))], false, 0]];
		sliceType.init([["rtype", "", "reflect", rtype, "reflect:\"slice\""], ["elem", "elem", "reflect", ($ptrType(rtype)), ""]]);
		structField.init([["name", "name", "reflect", ($ptrType($String)), ""], ["pkgPath", "pkgPath", "reflect", ($ptrType($String)), ""], ["typ", "typ", "reflect", ($ptrType(rtype)), ""], ["tag", "tag", "reflect", ($ptrType($String)), ""], ["offset", "offset", "reflect", $Uintptr, ""]]);
		structType.methods = [["uncommon", "uncommon", "reflect", [], [($ptrType(uncommonType))], false, 0]];
		($ptrType(structType)).methods = [["Align", "Align", "", [], [$Int], false, 0], ["AssignableTo", "AssignableTo", "", [Type], [$Bool], false, 0], ["Bits", "Bits", "", [], [$Int], false, 0], ["ChanDir", "ChanDir", "", [], [ChanDir], false, 0], ["ConvertibleTo", "ConvertibleTo", "", [Type], [$Bool], false, 0], ["Elem", "Elem", "", [], [Type], false, 0], ["Field", "Field", "", [$Int], [StructField], false, -1], ["FieldAlign", "FieldAlign", "", [], [$Int], false, 0], ["FieldByIndex", "FieldByIndex", "", [($sliceType($Int))], [StructField], false, -1], ["FieldByName", "FieldByName", "", [$String], [StructField, $Bool], false, -1], ["FieldByNameFunc", "FieldByNameFunc", "", [($funcType([$String], [$Bool], false))], [StructField, $Bool], false, -1], ["Implements", "Implements", "", [Type], [$Bool], false, 0], ["In", "In", "", [$Int], [Type], false, 0], ["IsVariadic", "IsVariadic", "", [], [$Bool], false, 0], ["Key", "Key", "", [], [Type], false, 0], ["Kind", "Kind", "", [], [Kind], false, 0], ["Len", "Len", "", [], [$Int], false, 0], ["Method", "Method", "", [$Int], [Method], false, 0], ["MethodByName", "MethodByName", "", [$String], [Method, $Bool], false, 0], ["Name", "Name", "", [], [$String], false, 0], ["NumField", "NumField", "", [], [$Int], false, 0], ["NumIn", "NumIn", "", [], [$Int], false, 0], ["NumMethod", "NumMethod", "", [], [$Int], false, 0], ["NumOut", "NumOut", "", [], [$Int], false, 0], ["Out", "Out", "", [$Int], [Type], false, 0], ["PkgPath", "PkgPath", "", [], [$String], false, 0], ["Size", "Size", "", [], [$Uintptr], false, 0], ["String", "String", "", [], [$String], false, 0], ["common", "common", "reflect", [], [($ptrType(rtype))], false, 0], ["pointers", "pointers", "reflect", [], [$Bool], false, 0], ["ptrTo", "ptrTo", "reflect", [], [($ptrType(rtype))], false, 0], ["uncommon", "uncommon", "reflect", [], [($ptrType(uncommonType))], false, 0]];
		structType.init([["rtype", "", "reflect", rtype, "reflect:\"struct\""], ["fields", "fields", "reflect", ($sliceType(structField)), ""]]);
		Method.init([["Name", "Name", "", $String, ""], ["PkgPath", "PkgPath", "", $String, ""], ["Type", "Type", "", Type, ""], ["Func", "Func", "", Value, ""], ["Index", "Index", "", $Int, ""]]);
		StructField.init([["Name", "Name", "", $String, ""], ["PkgPath", "PkgPath", "", $String, ""], ["Type", "Type", "", Type, ""], ["Tag", "Tag", "", StructTag, ""], ["Offset", "Offset", "", $Uintptr, ""], ["Index", "Index", "", ($sliceType($Int)), ""], ["Anonymous", "Anonymous", "", $Bool, ""]]);
		StructTag.methods = [["Get", "Get", "", [$String], [$String], false, -1]];
		($ptrType(StructTag)).methods = [["Get", "Get", "", [$String], [$String], false, -1]];
		fieldScan.init([["typ", "typ", "reflect", ($ptrType(structType)), ""], ["index", "index", "reflect", ($sliceType($Int)), ""]]);
		Value.methods = [["Addr", "Addr", "", [], [Value], false, -1], ["Bool", "Bool", "", [], [$Bool], false, -1], ["Bytes", "Bytes", "", [], [($sliceType($Uint8))], false, -1], ["Call", "Call", "", [($sliceType(Value))], [($sliceType(Value))], false, -1], ["CallSlice", "CallSlice", "", [($sliceType(Value))], [($sliceType(Value))], false, -1], ["CanAddr", "CanAddr", "", [], [$Bool], false, -1], ["CanInterface", "CanInterface", "", [], [$Bool], false, -1], ["CanSet", "CanSet", "", [], [$Bool], false, -1], ["Cap", "Cap", "", [], [$Int], false, -1], ["Close", "Close", "", [], [], false, -1], ["Complex", "Complex", "", [], [$Complex128], false, -1], ["Convert", "Convert", "", [Type], [Value], false, -1], ["Elem", "Elem", "", [], [Value], false, -1], ["Field", "Field", "", [$Int], [Value], false, -1], ["FieldByIndex", "FieldByIndex", "", [($sliceType($Int))], [Value], false, -1], ["FieldByName", "FieldByName", "", [$String], [Value], false, -1], ["FieldByNameFunc", "FieldByNameFunc", "", [($funcType([$String], [$Bool], false))], [Value], false, -1], ["Float", "Float", "", [], [$Float64], false, -1], ["Index", "Index", "", [$Int], [Value], false, -1], ["Int", "Int", "", [], [$Int64], false, -1], ["Interface", "Interface", "", [], [$emptyInterface], false, -1], ["InterfaceData", "InterfaceData", "", [], [($arrayType($Uintptr, 2))], false, -1], ["IsNil", "IsNil", "", [], [$Bool], false, -1], ["IsValid", "IsValid", "", [], [$Bool], false, -1], ["Kind", "Kind", "", [], [Kind], false, -1], ["Len", "Len", "", [], [$Int], false, -1], ["MapIndex", "MapIndex", "", [Value], [Value], false, -1], ["MapKeys", "MapKeys", "", [], [($sliceType(Value))], false, -1], ["Method", "Method", "", [$Int], [Value], false, -1], ["MethodByName", "MethodByName", "", [$String], [Value], false, -1], ["NumField", "NumField", "", [], [$Int], false, -1], ["NumMethod", "NumMethod", "", [], [$Int], false, -1], ["OverflowComplex", "OverflowComplex", "", [$Complex128], [$Bool], false, -1], ["OverflowFloat", "OverflowFloat", "", [$Float64], [$Bool], false, -1], ["OverflowInt", "OverflowInt", "", [$Int64], [$Bool], false, -1], ["OverflowUint", "OverflowUint", "", [$Uint64], [$Bool], false, -1], ["Pointer", "Pointer", "", [], [$Uintptr], false, -1], ["Recv", "Recv", "", [], [Value, $Bool], false, -1], ["Send", "Send", "", [Value], [], false, -1], ["Set", "Set", "", [Value], [], false, -1], ["SetBool", "SetBool", "", [$Bool], [], false, -1], ["SetBytes", "SetBytes", "", [($sliceType($Uint8))], [], false, -1], ["SetCap", "SetCap", "", [$Int], [], false, -1], ["SetComplex", "SetComplex", "", [$Complex128], [], false, -1], ["SetFloat", "SetFloat", "", [$Float64], [], false, -1], ["SetInt", "SetInt", "", [$Int64], [], false, -1], ["SetLen", "SetLen", "", [$Int], [], false, -1], ["SetMapIndex", "SetMapIndex", "", [Value, Value], [], false, -1], ["SetPointer", "SetPointer", "", [$UnsafePointer], [], false, -1], ["SetString", "SetString", "", [$String], [], false, -1], ["SetUint", "SetUint", "", [$Uint64], [], false, -1], ["Slice", "Slice", "", [$Int, $Int], [Value], false, -1], ["Slice3", "Slice3", "", [$Int, $Int, $Int], [Value], false, -1], ["String", "String", "", [], [$String], false, -1], ["TryRecv", "TryRecv", "", [], [Value, $Bool], false, -1], ["TrySend", "TrySend", "", [Value], [$Bool], false, -1], ["Type", "Type", "", [], [Type], false, -1], ["Uint", "Uint", "", [], [$Uint64], false, -1], ["UnsafeAddr", "UnsafeAddr", "", [], [$Uintptr], false, -1], ["assignTo", "assignTo", "reflect", [$String, ($ptrType(rtype)), ($ptrType($emptyInterface))], [Value], false, -1], ["call", "call", "reflect", [$String, ($sliceType(Value))], [($sliceType(Value))], false, -1], ["iword", "iword", "reflect", [], [iword], false, -1], ["kind", "kind", "reflect", [], [Kind], false, 3], ["mustBe", "mustBe", "reflect", [Kind], [], false, 3], ["mustBeAssignable", "mustBeAssignable", "reflect", [], [], false, 3], ["mustBeExported", "mustBeExported", "reflect", [], [], false, 3], ["pointer", "pointer", "reflect", [], [$UnsafePointer], false, -1], ["recv", "recv", "reflect", [$Bool], [Value, $Bool], false, -1], ["runes", "runes", "reflect", [], [($sliceType($Int32))], false, -1], ["send", "send", "reflect", [Value, $Bool], [$Bool], false, -1], ["setRunes", "setRunes", "reflect", [($sliceType($Int32))], [], false, -1]];
		($ptrType(Value)).methods = [["Addr", "Addr", "", [], [Value], false, -1], ["Bool", "Bool", "", [], [$Bool], false, -1], ["Bytes", "Bytes", "", [], [($sliceType($Uint8))], false, -1], ["Call", "Call", "", [($sliceType(Value))], [($sliceType(Value))], false, -1], ["CallSlice", "CallSlice", "", [($sliceType(Value))], [($sliceType(Value))], false, -1], ["CanAddr", "CanAddr", "", [], [$Bool], false, -1], ["CanInterface", "CanInterface", "", [], [$Bool], false, -1], ["CanSet", "CanSet", "", [], [$Bool], false, -1], ["Cap", "Cap", "", [], [$Int], false, -1], ["Close", "Close", "", [], [], false, -1], ["Complex", "Complex", "", [], [$Complex128], false, -1], ["Convert", "Convert", "", [Type], [Value], false, -1], ["Elem", "Elem", "", [], [Value], false, -1], ["Field", "Field", "", [$Int], [Value], false, -1], ["FieldByIndex", "FieldByIndex", "", [($sliceType($Int))], [Value], false, -1], ["FieldByName", "FieldByName", "", [$String], [Value], false, -1], ["FieldByNameFunc", "FieldByNameFunc", "", [($funcType([$String], [$Bool], false))], [Value], false, -1], ["Float", "Float", "", [], [$Float64], false, -1], ["Index", "Index", "", [$Int], [Value], false, -1], ["Int", "Int", "", [], [$Int64], false, -1], ["Interface", "Interface", "", [], [$emptyInterface], false, -1], ["InterfaceData", "InterfaceData", "", [], [($arrayType($Uintptr, 2))], false, -1], ["IsNil", "IsNil", "", [], [$Bool], false, -1], ["IsValid", "IsValid", "", [], [$Bool], false, -1], ["Kind", "Kind", "", [], [Kind], false, -1], ["Len", "Len", "", [], [$Int], false, -1], ["MapIndex", "MapIndex", "", [Value], [Value], false, -1], ["MapKeys", "MapKeys", "", [], [($sliceType(Value))], false, -1], ["Method", "Method", "", [$Int], [Value], false, -1], ["MethodByName", "MethodByName", "", [$String], [Value], false, -1], ["NumField", "NumField", "", [], [$Int], false, -1], ["NumMethod", "NumMethod", "", [], [$Int], false, -1], ["OverflowComplex", "OverflowComplex", "", [$Complex128], [$Bool], false, -1], ["OverflowFloat", "OverflowFloat", "", [$Float64], [$Bool], false, -1], ["OverflowInt", "OverflowInt", "", [$Int64], [$Bool], false, -1], ["OverflowUint", "OverflowUint", "", [$Uint64], [$Bool], false, -1], ["Pointer", "Pointer", "", [], [$Uintptr], false, -1], ["Recv", "Recv", "", [], [Value, $Bool], false, -1], ["Send", "Send", "", [Value], [], false, -1], ["Set", "Set", "", [Value], [], false, -1], ["SetBool", "SetBool", "", [$Bool], [], false, -1], ["SetBytes", "SetBytes", "", [($sliceType($Uint8))], [], false, -1], ["SetCap", "SetCap", "", [$Int], [], false, -1], ["SetComplex", "SetComplex", "", [$Complex128], [], false, -1], ["SetFloat", "SetFloat", "", [$Float64], [], false, -1], ["SetInt", "SetInt", "", [$Int64], [], false, -1], ["SetLen", "SetLen", "", [$Int], [], false, -1], ["SetMapIndex", "SetMapIndex", "", [Value, Value], [], false, -1], ["SetPointer", "SetPointer", "", [$UnsafePointer], [], false, -1], ["SetString", "SetString", "", [$String], [], false, -1], ["SetUint", "SetUint", "", [$Uint64], [], false, -1], ["Slice", "Slice", "", [$Int, $Int], [Value], false, -1], ["Slice3", "Slice3", "", [$Int, $Int, $Int], [Value], false, -1], ["String", "String", "", [], [$String], false, -1], ["TryRecv", "TryRecv", "", [], [Value, $Bool], false, -1], ["TrySend", "TrySend", "", [Value], [$Bool], false, -1], ["Type", "Type", "", [], [Type], false, -1], ["Uint", "Uint", "", [], [$Uint64], false, -1], ["UnsafeAddr", "UnsafeAddr", "", [], [$Uintptr], false, -1], ["assignTo", "assignTo", "reflect", [$String, ($ptrType(rtype)), ($ptrType($emptyInterface))], [Value], false, -1], ["call", "call", "reflect", [$String, ($sliceType(Value))], [($sliceType(Value))], false, -1], ["iword", "iword", "reflect", [], [iword], false, -1], ["kind", "kind", "reflect", [], [Kind], false, 3], ["mustBe", "mustBe", "reflect", [Kind], [], false, 3], ["mustBeAssignable", "mustBeAssignable", "reflect", [], [], false, 3], ["mustBeExported", "mustBeExported", "reflect", [], [], false, 3], ["pointer", "pointer", "reflect", [], [$UnsafePointer], false, -1], ["recv", "recv", "reflect", [$Bool], [Value, $Bool], false, -1], ["runes", "runes", "reflect", [], [($sliceType($Int32))], false, -1], ["send", "send", "reflect", [Value, $Bool], [$Bool], false, -1], ["setRunes", "setRunes", "reflect", [($sliceType($Int32))], [], false, -1]];
		Value.init([["typ", "typ", "reflect", ($ptrType(rtype)), ""], ["ptr", "ptr", "reflect", $UnsafePointer, ""], ["scalar", "scalar", "reflect", $Uintptr, ""], ["flag", "", "reflect", flag, ""]]);
		flag.methods = [["kind", "kind", "reflect", [], [Kind], false, -1], ["mustBe", "mustBe", "reflect", [Kind], [], false, -1], ["mustBeAssignable", "mustBeAssignable", "reflect", [], [], false, -1], ["mustBeExported", "mustBeExported", "reflect", [], [], false, -1]];
		($ptrType(flag)).methods = [["kind", "kind", "reflect", [], [Kind], false, -1], ["mustBe", "mustBe", "reflect", [Kind], [], false, -1], ["mustBeAssignable", "mustBeAssignable", "reflect", [], [], false, -1], ["mustBeExported", "mustBeExported", "reflect", [], [], false, -1]];
		($ptrType(ValueError)).methods = [["Error", "Error", "", [], [$String], false, -1]];
		ValueError.init([["Method", "Method", "", $String, ""], ["Kind", "Kind", "", Kind, ""]]);
		nonEmptyInterface.init([["itab", "itab", "reflect", ($ptrType(($structType([["ityp", "ityp", "reflect", ($ptrType(rtype)), ""], ["typ", "typ", "reflect", ($ptrType(rtype)), ""], ["link", "link", "reflect", $UnsafePointer, ""], ["bad", "bad", "reflect", $Int32, ""], ["unused", "unused", "reflect", $Int32, ""], ["fun", "fun", "reflect", ($arrayType($UnsafePointer, 100000)), ""]])))), ""], ["word", "word", "reflect", iword, ""]]);
		initialized = false;
		kindNames = new ($sliceType($String))(["invalid", "bool", "int", "int8", "int16", "int32", "int64", "uint", "uint8", "uint16", "uint32", "uint64", "uintptr", "float32", "float64", "complex64", "complex128", "array", "chan", "func", "interface", "map", "ptr", "slice", "string", "struct", "unsafe.Pointer"]);
		uint8Type = (x = TypeOf(new $Uint8(0)), (x !== null && x.constructor === ($ptrType(rtype)) ? x.$val : $typeAssertionFailed(x, ($ptrType(rtype)))));
		init();
	};
	return $pkg;
})();
$packages["fmt"] = (function() {
	var $pkg = {}, math = $packages["math"], strconv = $packages["strconv"], utf8 = $packages["unicode/utf8"], errors = $packages["errors"], io = $packages["io"], os = $packages["os"], reflect = $packages["reflect"], sync = $packages["sync"], fmt, State, Formatter, Stringer, GoStringer, buffer, pp, runeUnreader, scanError, ss, ssave, padZeroBytes, padSpaceBytes, trueBytes, falseBytes, commaSpaceBytes, nilAngleBytes, nilParenBytes, nilBytes, mapBytes, percentBangBytes, panicBytes, irparenBytes, bytesBytes, ppFree, intBits, uintptrBits, space, ssFree, complexError, boolError, init, doPrec, newPrinter, Sprintln, getField, isSpace, notSpace, indexRune;
	fmt = $pkg.fmt = $newType(0, "Struct", "fmt.fmt", "fmt", "fmt", function(intbuf_, buf_, wid_, prec_, widPresent_, precPresent_, minus_, plus_, sharp_, space_, unicode_, uniQuote_, zero_) {
		this.$val = this;
		this.intbuf = intbuf_ !== undefined ? intbuf_ : ($arrayType($Uint8, 65)).zero();
		this.buf = buf_ !== undefined ? buf_ : ($ptrType(buffer)).nil;
		this.wid = wid_ !== undefined ? wid_ : 0;
		this.prec = prec_ !== undefined ? prec_ : 0;
		this.widPresent = widPresent_ !== undefined ? widPresent_ : false;
		this.precPresent = precPresent_ !== undefined ? precPresent_ : false;
		this.minus = minus_ !== undefined ? minus_ : false;
		this.plus = plus_ !== undefined ? plus_ : false;
		this.sharp = sharp_ !== undefined ? sharp_ : false;
		this.space = space_ !== undefined ? space_ : false;
		this.unicode = unicode_ !== undefined ? unicode_ : false;
		this.uniQuote = uniQuote_ !== undefined ? uniQuote_ : false;
		this.zero = zero_ !== undefined ? zero_ : false;
	});
	State = $pkg.State = $newType(8, "Interface", "fmt.State", "State", "fmt", null);
	Formatter = $pkg.Formatter = $newType(8, "Interface", "fmt.Formatter", "Formatter", "fmt", null);
	Stringer = $pkg.Stringer = $newType(8, "Interface", "fmt.Stringer", "Stringer", "fmt", null);
	GoStringer = $pkg.GoStringer = $newType(8, "Interface", "fmt.GoStringer", "GoStringer", "fmt", null);
	buffer = $pkg.buffer = $newType(12, "Slice", "fmt.buffer", "buffer", "fmt", null);
	pp = $pkg.pp = $newType(0, "Struct", "fmt.pp", "pp", "fmt", function(n_, panicking_, erroring_, buf_, arg_, value_, reordered_, goodArgNum_, runeBuf_, fmt_) {
		this.$val = this;
		this.n = n_ !== undefined ? n_ : 0;
		this.panicking = panicking_ !== undefined ? panicking_ : false;
		this.erroring = erroring_ !== undefined ? erroring_ : false;
		this.buf = buf_ !== undefined ? buf_ : buffer.nil;
		this.arg = arg_ !== undefined ? arg_ : null;
		this.value = value_ !== undefined ? value_ : new reflect.Value.Ptr();
		this.reordered = reordered_ !== undefined ? reordered_ : false;
		this.goodArgNum = goodArgNum_ !== undefined ? goodArgNum_ : false;
		this.runeBuf = runeBuf_ !== undefined ? runeBuf_ : ($arrayType($Uint8, 4)).zero();
		this.fmt = fmt_ !== undefined ? fmt_ : new fmt.Ptr();
	});
	runeUnreader = $pkg.runeUnreader = $newType(8, "Interface", "fmt.runeUnreader", "runeUnreader", "fmt", null);
	scanError = $pkg.scanError = $newType(0, "Struct", "fmt.scanError", "scanError", "fmt", function(err_) {
		this.$val = this;
		this.err = err_ !== undefined ? err_ : null;
	});
	ss = $pkg.ss = $newType(0, "Struct", "fmt.ss", "ss", "fmt", function(rr_, buf_, peekRune_, prevRune_, count_, atEOF_, ssave_) {
		this.$val = this;
		this.rr = rr_ !== undefined ? rr_ : null;
		this.buf = buf_ !== undefined ? buf_ : buffer.nil;
		this.peekRune = peekRune_ !== undefined ? peekRune_ : 0;
		this.prevRune = prevRune_ !== undefined ? prevRune_ : 0;
		this.count = count_ !== undefined ? count_ : 0;
		this.atEOF = atEOF_ !== undefined ? atEOF_ : false;
		this.ssave = ssave_ !== undefined ? ssave_ : new ssave.Ptr();
	});
	ssave = $pkg.ssave = $newType(0, "Struct", "fmt.ssave", "ssave", "fmt", function(validSave_, nlIsEnd_, nlIsSpace_, argLimit_, limit_, maxWid_) {
		this.$val = this;
		this.validSave = validSave_ !== undefined ? validSave_ : false;
		this.nlIsEnd = nlIsEnd_ !== undefined ? nlIsEnd_ : false;
		this.nlIsSpace = nlIsSpace_ !== undefined ? nlIsSpace_ : false;
		this.argLimit = argLimit_ !== undefined ? argLimit_ : 0;
		this.limit = limit_ !== undefined ? limit_ : 0;
		this.maxWid = maxWid_ !== undefined ? maxWid_ : 0;
	});
	init = function() {
		var i;
		i = 0;
		while (i < 65) {
			(i < 0 || i >= padZeroBytes.$length) ? $throwRuntimeError("index out of range") : padZeroBytes.$array[padZeroBytes.$offset + i] = 48;
			(i < 0 || i >= padSpaceBytes.$length) ? $throwRuntimeError("index out of range") : padSpaceBytes.$array[padSpaceBytes.$offset + i] = 32;
			i = i + (1) >> 0;
		}
	};
	fmt.Ptr.prototype.clearflags = function() {
		var f;
		f = this;
		f.wid = 0;
		f.widPresent = false;
		f.prec = 0;
		f.precPresent = false;
		f.minus = false;
		f.plus = false;
		f.sharp = false;
		f.space = false;
		f.unicode = false;
		f.uniQuote = false;
		f.zero = false;
	};
	fmt.prototype.clearflags = function() { return this.$val.clearflags(); };
	fmt.Ptr.prototype.init = function(buf) {
		var f;
		f = this;
		f.buf = buf;
		f.clearflags();
	};
	fmt.prototype.init = function(buf) { return this.$val.init(buf); };
	fmt.Ptr.prototype.computePadding = function(width) {
		var padding = ($sliceType($Uint8)).nil, leftWidth = 0, rightWidth = 0, f, left, w, _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, _tmp$6, _tmp$7, _tmp$8;
		f = this;
		left = !f.minus;
		w = f.wid;
		if (w < 0) {
			left = false;
			w = -w;
		}
		w = w - (width) >> 0;
		if (w > 0) {
			if (left && f.zero) {
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
	fmt.Ptr.prototype.writePadding = function(n, padding) {
		var f, m;
		f = this;
		while (n > 0) {
			m = n;
			if (m > 65) {
				m = 65;
			}
			f.buf.Write($subslice(padding, 0, m));
			n = n - (m) >> 0;
		}
	};
	fmt.prototype.writePadding = function(n, padding) { return this.$val.writePadding(n, padding); };
	fmt.Ptr.prototype.pad = function(b) {
		var f, _tuple, padding, left, right;
		f = this;
		if (!f.widPresent || (f.wid === 0)) {
			f.buf.Write(b);
			return;
		}
		_tuple = f.computePadding(b.$length); padding = _tuple[0]; left = _tuple[1]; right = _tuple[2];
		if (left > 0) {
			f.writePadding(left, padding);
		}
		f.buf.Write(b);
		if (right > 0) {
			f.writePadding(right, padding);
		}
	};
	fmt.prototype.pad = function(b) { return this.$val.pad(b); };
	fmt.Ptr.prototype.padString = function(s) {
		var f, _tuple, padding, left, right;
		f = this;
		if (!f.widPresent || (f.wid === 0)) {
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
	fmt.Ptr.prototype.fmt_boolean = function(v) {
		var f;
		f = this;
		if (v) {
			f.pad(trueBytes);
		} else {
			f.pad(falseBytes);
		}
	};
	fmt.prototype.fmt_boolean = function(v) { return this.$val.fmt_boolean(v); };
	fmt.Ptr.prototype.integer = function(a, base, signedness, digits) {
		var f, buf, width, negative, prec, i, ua, _ref, runeWidth, width$1, j;
		f = this;
		if (f.precPresent && (f.prec === 0) && (a.$high === 0 && a.$low === 0)) {
			return;
		}
		buf = $subslice(new ($sliceType($Uint8))(f.intbuf), 0);
		if (f.widPresent) {
			width = f.wid;
			if ((base.$high === 0 && base.$low === 16) && f.sharp) {
				width = width + (2) >> 0;
			}
			if (width > 65) {
				buf = ($sliceType($Uint8)).make(width);
			}
		}
		negative = signedness === true && (a.$high < 0 || (a.$high === 0 && a.$low < 0));
		if (negative) {
			a = new $Int64(-a.$high, -a.$low);
		}
		prec = 0;
		if (f.precPresent) {
			prec = f.prec;
			f.zero = false;
		} else if (f.zero && f.widPresent && !f.minus && f.wid > 0) {
			prec = f.wid;
			if (negative || f.plus || f.space) {
				prec = prec - (1) >> 0;
			}
		}
		i = buf.$length;
		ua = new $Uint64(a.$high, a.$low);
		while ((ua.$high > base.$high || (ua.$high === base.$high && ua.$low >= base.$low))) {
			i = i - (1) >> 0;
			(i < 0 || i >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + i] = digits.charCodeAt($flatten64($div64(ua, base, true)));
			ua = $div64(ua, (base), false);
		}
		i = i - (1) >> 0;
		(i < 0 || i >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + i] = digits.charCodeAt($flatten64(ua));
		while (i > 0 && prec > (buf.$length - i >> 0)) {
			i = i - (1) >> 0;
			(i < 0 || i >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + i] = 48;
		}
		if (f.sharp) {
			_ref = base;
			if ((_ref.$high === 0 && _ref.$low === 8)) {
				if (!((((i < 0 || i >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + i]) === 48))) {
					i = i - (1) >> 0;
					(i < 0 || i >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + i] = 48;
				}
			} else if ((_ref.$high === 0 && _ref.$low === 16)) {
				i = i - (1) >> 0;
				(i < 0 || i >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + i] = (120 + digits.charCodeAt(10) << 24 >>> 24) - 97 << 24 >>> 24;
				i = i - (1) >> 0;
				(i < 0 || i >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + i] = 48;
			}
		}
		if (f.unicode) {
			i = i - (1) >> 0;
			(i < 0 || i >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + i] = 43;
			i = i - (1) >> 0;
			(i < 0 || i >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + i] = 85;
		}
		if (negative) {
			i = i - (1) >> 0;
			(i < 0 || i >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + i] = 45;
		} else if (f.plus) {
			i = i - (1) >> 0;
			(i < 0 || i >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + i] = 43;
		} else if (f.space) {
			i = i - (1) >> 0;
			(i < 0 || i >= buf.$length) ? $throwRuntimeError("index out of range") : buf.$array[buf.$offset + i] = 32;
		}
		if (f.unicode && f.uniQuote && (a.$high > 0 || (a.$high === 0 && a.$low >= 0)) && (a.$high < 0 || (a.$high === 0 && a.$low <= 1114111)) && strconv.IsPrint(((a.$low + ((a.$high >> 31) * 4294967296)) >> 0))) {
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
	fmt.Ptr.prototype.truncate = function(s) {
		var f, n, _ref, _i, _rune, i;
		f = this;
		if (f.precPresent && f.prec < utf8.RuneCountInString(s)) {
			n = f.prec;
			_ref = s;
			_i = 0;
			while (_i < _ref.length) {
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
	fmt.Ptr.prototype.fmt_s = function(s) {
		var f;
		f = this;
		s = f.truncate(s);
		f.padString(s);
	};
	fmt.prototype.fmt_s = function(s) { return this.$val.fmt_s(s); };
	fmt.Ptr.prototype.fmt_sbx = function(s, b, digits) {
		var f, n, x, buf, i, c;
		f = this;
		n = b.$length;
		if (b === ($sliceType($Uint8)).nil) {
			n = s.length;
		}
		x = (digits.charCodeAt(10) - 97 << 24 >>> 24) + 120 << 24 >>> 24;
		buf = ($sliceType($Uint8)).nil;
		i = 0;
		while (i < n) {
			if (i > 0 && f.space) {
				buf = $append(buf, 32);
			}
			if (f.sharp) {
				buf = $append(buf, 48, x);
			}
			c = 0;
			if (b === ($sliceType($Uint8)).nil) {
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
	fmt.Ptr.prototype.fmt_sx = function(s, digits) {
		var f;
		f = this;
		f.fmt_sbx(s, ($sliceType($Uint8)).nil, digits);
	};
	fmt.prototype.fmt_sx = function(s, digits) { return this.$val.fmt_sx(s, digits); };
	fmt.Ptr.prototype.fmt_bx = function(b, digits) {
		var f;
		f = this;
		f.fmt_sbx("", b, digits);
	};
	fmt.prototype.fmt_bx = function(b, digits) { return this.$val.fmt_bx(b, digits); };
	fmt.Ptr.prototype.fmt_q = function(s) {
		var f, quoted;
		f = this;
		s = f.truncate(s);
		quoted = "";
		if (f.sharp && strconv.CanBackquote(s)) {
			quoted = "`" + s + "`";
		} else {
			if (f.plus) {
				quoted = strconv.QuoteToASCII(s);
			} else {
				quoted = strconv.Quote(s);
			}
		}
		f.padString(quoted);
	};
	fmt.prototype.fmt_q = function(s) { return this.$val.fmt_q(s); };
	fmt.Ptr.prototype.fmt_qc = function(c) {
		var f, quoted;
		f = this;
		quoted = ($sliceType($Uint8)).nil;
		if (f.plus) {
			quoted = strconv.AppendQuoteRuneToASCII($subslice(new ($sliceType($Uint8))(f.intbuf), 0, 0), ((c.$low + ((c.$high >> 31) * 4294967296)) >> 0));
		} else {
			quoted = strconv.AppendQuoteRune($subslice(new ($sliceType($Uint8))(f.intbuf), 0, 0), ((c.$low + ((c.$high >> 31) * 4294967296)) >> 0));
		}
		f.pad(quoted);
	};
	fmt.prototype.fmt_qc = function(c) { return this.$val.fmt_qc(c); };
	doPrec = function(f, def) {
		if (f.precPresent) {
			return f.prec;
		}
		return def;
	};
	fmt.Ptr.prototype.formatFloat = function(v, verb, prec, n) {
		var $deferred = [], $err = null, f, num;
		/* */ try { $deferFrames.push($deferred);
		f = this;
		num = strconv.AppendFloat($subslice(new ($sliceType($Uint8))(f.intbuf), 0, 1), v, verb, prec, n);
		if ((((1 < 0 || 1 >= num.$length) ? $throwRuntimeError("index out of range") : num.$array[num.$offset + 1]) === 45) || (((1 < 0 || 1 >= num.$length) ? $throwRuntimeError("index out of range") : num.$array[num.$offset + 1]) === 43)) {
			num = $subslice(num, 1);
		} else {
			(0 < 0 || 0 >= num.$length) ? $throwRuntimeError("index out of range") : num.$array[num.$offset + 0] = 43;
		}
		if (math.IsInf(v, 0)) {
			if (f.zero) {
				$deferred.push([(function() {
					f.zero = true;
				}), []]);
				f.zero = false;
			}
		}
		if (f.zero && f.widPresent && f.wid > num.$length) {
			if (f.space && v >= 0) {
				f.buf.WriteByte(32);
				f.wid = f.wid - (1) >> 0;
			} else if (f.plus || v < 0) {
				f.buf.WriteByte(((0 < 0 || 0 >= num.$length) ? $throwRuntimeError("index out of range") : num.$array[num.$offset + 0]));
				f.wid = f.wid - (1) >> 0;
			}
			f.pad($subslice(num, 1));
			return;
		}
		if (f.space && (((0 < 0 || 0 >= num.$length) ? $throwRuntimeError("index out of range") : num.$array[num.$offset + 0]) === 43)) {
			(0 < 0 || 0 >= num.$length) ? $throwRuntimeError("index out of range") : num.$array[num.$offset + 0] = 32;
			f.pad(num);
			return;
		}
		if (f.plus || (((0 < 0 || 0 >= num.$length) ? $throwRuntimeError("index out of range") : num.$array[num.$offset + 0]) === 45) || math.IsInf(v, 0)) {
			f.pad(num);
			return;
		}
		f.pad($subslice(num, 1));
		/* */ } catch(err) { $err = err; } finally { $deferFrames.pop(); $callDeferred($deferred, $err); }
	};
	fmt.prototype.formatFloat = function(v, verb, prec, n) { return this.$val.formatFloat(v, verb, prec, n); };
	fmt.Ptr.prototype.fmt_e64 = function(v) {
		var f;
		f = this;
		f.formatFloat(v, 101, doPrec(f, 6), 64);
	};
	fmt.prototype.fmt_e64 = function(v) { return this.$val.fmt_e64(v); };
	fmt.Ptr.prototype.fmt_E64 = function(v) {
		var f;
		f = this;
		f.formatFloat(v, 69, doPrec(f, 6), 64);
	};
	fmt.prototype.fmt_E64 = function(v) { return this.$val.fmt_E64(v); };
	fmt.Ptr.prototype.fmt_f64 = function(v) {
		var f;
		f = this;
		f.formatFloat(v, 102, doPrec(f, 6), 64);
	};
	fmt.prototype.fmt_f64 = function(v) { return this.$val.fmt_f64(v); };
	fmt.Ptr.prototype.fmt_g64 = function(v) {
		var f;
		f = this;
		f.formatFloat(v, 103, doPrec(f, -1), 64);
	};
	fmt.prototype.fmt_g64 = function(v) { return this.$val.fmt_g64(v); };
	fmt.Ptr.prototype.fmt_G64 = function(v) {
		var f;
		f = this;
		f.formatFloat(v, 71, doPrec(f, -1), 64);
	};
	fmt.prototype.fmt_G64 = function(v) { return this.$val.fmt_G64(v); };
	fmt.Ptr.prototype.fmt_fb64 = function(v) {
		var f;
		f = this;
		f.formatFloat(v, 98, 0, 64);
	};
	fmt.prototype.fmt_fb64 = function(v) { return this.$val.fmt_fb64(v); };
	fmt.Ptr.prototype.fmt_e32 = function(v) {
		var f;
		f = this;
		f.formatFloat($coerceFloat32(v), 101, doPrec(f, 6), 32);
	};
	fmt.prototype.fmt_e32 = function(v) { return this.$val.fmt_e32(v); };
	fmt.Ptr.prototype.fmt_E32 = function(v) {
		var f;
		f = this;
		f.formatFloat($coerceFloat32(v), 69, doPrec(f, 6), 32);
	};
	fmt.prototype.fmt_E32 = function(v) { return this.$val.fmt_E32(v); };
	fmt.Ptr.prototype.fmt_f32 = function(v) {
		var f;
		f = this;
		f.formatFloat($coerceFloat32(v), 102, doPrec(f, 6), 32);
	};
	fmt.prototype.fmt_f32 = function(v) { return this.$val.fmt_f32(v); };
	fmt.Ptr.prototype.fmt_g32 = function(v) {
		var f;
		f = this;
		f.formatFloat($coerceFloat32(v), 103, doPrec(f, -1), 32);
	};
	fmt.prototype.fmt_g32 = function(v) { return this.$val.fmt_g32(v); };
	fmt.Ptr.prototype.fmt_G32 = function(v) {
		var f;
		f = this;
		f.formatFloat($coerceFloat32(v), 71, doPrec(f, -1), 32);
	};
	fmt.prototype.fmt_G32 = function(v) { return this.$val.fmt_G32(v); };
	fmt.Ptr.prototype.fmt_fb32 = function(v) {
		var f;
		f = this;
		f.formatFloat($coerceFloat32(v), 98, 0, 32);
	};
	fmt.prototype.fmt_fb32 = function(v) { return this.$val.fmt_fb32(v); };
	fmt.Ptr.prototype.fmt_c64 = function(v, verb) {
		var f;
		f = this;
		f.fmt_complex($coerceFloat32(v.$real), $coerceFloat32(v.$imag), 32, verb);
	};
	fmt.prototype.fmt_c64 = function(v, verb) { return this.$val.fmt_c64(v, verb); };
	fmt.Ptr.prototype.fmt_c128 = function(v, verb) {
		var f;
		f = this;
		f.fmt_complex(v.$real, v.$imag, 64, verb);
	};
	fmt.prototype.fmt_c128 = function(v, verb) { return this.$val.fmt_c128(v, verb); };
	fmt.Ptr.prototype.fmt_complex = function(r, j, size, verb) {
		var f, oldPlus, oldSpace, oldWid, i, _ref;
		f = this;
		f.buf.WriteByte(40);
		oldPlus = f.plus;
		oldSpace = f.space;
		oldWid = f.wid;
		i = 0;
		while (true) {
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
			f.plus = true;
			f.space = false;
			f.wid = oldWid;
			r = j;
			i = i + (1) >> 0;
		}
		f.space = oldSpace;
		f.plus = oldPlus;
		f.wid = oldWid;
		f.buf.Write(irparenBytes);
	};
	fmt.prototype.fmt_complex = function(r, j, size, verb) { return this.$val.fmt_complex(r, j, size, verb); };
	$ptrType(buffer).prototype.Write = function(p) {
		var n = 0, err = null, b, _tmp, _tmp$1;
		b = this;
		b.$set($appendSlice(b.$get(), p));
		_tmp = p.$length; _tmp$1 = null; n = _tmp; err = _tmp$1;
		return [n, err];
	};
	$ptrType(buffer).prototype.WriteString = function(s) {
		var n = 0, err = null, b, _tmp, _tmp$1;
		b = this;
		b.$set($appendSlice(b.$get(), new buffer($stringToBytes(s))));
		_tmp = s.length; _tmp$1 = null; n = _tmp; err = _tmp$1;
		return [n, err];
	};
	$ptrType(buffer).prototype.WriteByte = function(c) {
		var b;
		b = this;
		b.$set($append(b.$get(), c));
		return null;
	};
	$ptrType(buffer).prototype.WriteRune = function(r) {
		var bp, b, n, x, w;
		bp = this;
		if (r < 128) {
			bp.$set($append(bp.$get(), (r << 24 >>> 24)));
			return null;
		}
		b = bp.$get();
		n = b.$length;
		while ((n + 4 >> 0) > b.$capacity) {
			b = $append(b, 0);
		}
		w = utf8.EncodeRune((x = $subslice(b, n, (n + 4 >> 0)), $subslice(new ($sliceType($Uint8))(x.$array), x.$offset, x.$offset + x.$length)), r);
		bp.$set($subslice(b, 0, (n + w >> 0)));
		return null;
	};
	newPrinter = function() {
		var x, p;
		p = (x = ppFree.Get(), (x !== null && x.constructor === ($ptrType(pp)) ? x.$val : $typeAssertionFailed(x, ($ptrType(pp)))));
		p.panicking = false;
		p.erroring = false;
		p.fmt.init(new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p));
		return p;
	};
	pp.Ptr.prototype.free = function() {
		var p;
		p = this;
		if (p.buf.$capacity > 1024) {
			return;
		}
		p.buf = $subslice(p.buf, 0, 0);
		p.arg = null;
		$copy(p.value, new reflect.Value.Ptr(($ptrType(reflect.rtype)).nil, 0, 0, 0), reflect.Value);
		ppFree.Put(p);
	};
	pp.prototype.free = function() { return this.$val.free(); };
	pp.Ptr.prototype.Width = function() {
		var wid = 0, ok = false, p, _tmp, _tmp$1;
		p = this;
		_tmp = p.fmt.wid; _tmp$1 = p.fmt.widPresent; wid = _tmp; ok = _tmp$1;
		return [wid, ok];
	};
	pp.prototype.Width = function() { return this.$val.Width(); };
	pp.Ptr.prototype.Precision = function() {
		var prec = 0, ok = false, p, _tmp, _tmp$1;
		p = this;
		_tmp = p.fmt.prec; _tmp$1 = p.fmt.precPresent; prec = _tmp; ok = _tmp$1;
		return [prec, ok];
	};
	pp.prototype.Precision = function() { return this.$val.Precision(); };
	pp.Ptr.prototype.Flag = function(b) {
		var p, _ref;
		p = this;
		_ref = b;
		if (_ref === 45) {
			return p.fmt.minus;
		} else if (_ref === 43) {
			return p.fmt.plus;
		} else if (_ref === 35) {
			return p.fmt.sharp;
		} else if (_ref === 32) {
			return p.fmt.space;
		} else if (_ref === 48) {
			return p.fmt.zero;
		}
		return false;
	};
	pp.prototype.Flag = function(b) { return this.$val.Flag(b); };
	pp.Ptr.prototype.add = function(c) {
		var p;
		p = this;
		new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteRune(c);
	};
	pp.prototype.add = function(c) { return this.$val.add(c); };
	pp.Ptr.prototype.Write = function(b) {
		var ret = 0, err = null, p, _tuple;
		p = this;
		_tuple = new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).Write(b); ret = _tuple[0]; err = _tuple[1];
		return [ret, err];
	};
	pp.prototype.Write = function(b) { return this.$val.Write(b); };
	Sprintln = $pkg.Sprintln = function(a) {
		var p, s;
		p = newPrinter();
		p.doPrint(a, true, true);
		s = $bytesToString(p.buf);
		p.free();
		return s;
	};
	getField = function(v, i) {
		var val;
		val = new reflect.Value.Ptr(); $copy(val, v.Field(i), reflect.Value);
		if ((val.Kind() === 20) && !val.IsNil()) {
			$copy(val, val.Elem(), reflect.Value);
		}
		return val;
	};
	pp.Ptr.prototype.unknownType = function(v) {
		var p;
		p = this;
		if ($interfaceIsEqual(v, null)) {
			new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).Write(nilAngleBytes);
			return;
		}
		new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(63);
		new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteString(reflect.TypeOf(v).String());
		new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(63);
	};
	pp.prototype.unknownType = function(v) { return this.$val.unknownType(v); };
	pp.Ptr.prototype.badVerb = function(verb) {
		var p;
		p = this;
		p.erroring = true;
		p.add(37);
		p.add(33);
		p.add(verb);
		p.add(40);
		if (!($interfaceIsEqual(p.arg, null))) {
			new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteString(reflect.TypeOf(p.arg).String());
			p.add(61);
			p.printArg(p.arg, 118, false, false, 0);
		} else if (p.value.IsValid()) {
			new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteString(p.value.Type().String());
			p.add(61);
			p.printValue($clone(p.value, reflect.Value), 118, false, false, 0);
		} else {
			new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).Write(nilAngleBytes);
		}
		p.add(41);
		p.erroring = false;
	};
	pp.prototype.badVerb = function(verb) { return this.$val.badVerb(verb); };
	pp.Ptr.prototype.fmtBool = function(v, verb) {
		var p, _ref;
		p = this;
		_ref = verb;
		if (_ref === 116 || _ref === 118) {
			p.fmt.fmt_boolean(v);
		} else {
			p.badVerb(verb);
		}
	};
	pp.prototype.fmtBool = function(v, verb) { return this.$val.fmtBool(v, verb); };
	pp.Ptr.prototype.fmtC = function(c) {
		var p, r, x, w;
		p = this;
		r = ((c.$low + ((c.$high >> 31) * 4294967296)) >> 0);
		if (!((x = new $Int64(0, r), (x.$high === c.$high && x.$low === c.$low)))) {
			r = 65533;
		}
		w = utf8.EncodeRune($subslice(new ($sliceType($Uint8))(p.runeBuf), 0, 4), r);
		p.fmt.pad($subslice(new ($sliceType($Uint8))(p.runeBuf), 0, w));
	};
	pp.prototype.fmtC = function(c) { return this.$val.fmtC(c); };
	pp.Ptr.prototype.fmtInt64 = function(v, verb) {
		var p, _ref;
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
	pp.Ptr.prototype.fmt0x64 = function(v, leading0x) {
		var p, sharp;
		p = this;
		sharp = p.fmt.sharp;
		p.fmt.sharp = leading0x;
		p.fmt.integer(new $Int64(v.$high, v.$low), new $Uint64(0, 16), false, "0123456789abcdef");
		p.fmt.sharp = sharp;
	};
	pp.prototype.fmt0x64 = function(v, leading0x) { return this.$val.fmt0x64(v, leading0x); };
	pp.Ptr.prototype.fmtUnicode = function(v) {
		var p, precPresent, sharp, prec;
		p = this;
		precPresent = p.fmt.precPresent;
		sharp = p.fmt.sharp;
		p.fmt.sharp = false;
		prec = p.fmt.prec;
		if (!precPresent) {
			p.fmt.prec = 4;
			p.fmt.precPresent = true;
		}
		p.fmt.unicode = true;
		p.fmt.uniQuote = sharp;
		p.fmt.integer(v, new $Uint64(0, 16), false, "0123456789ABCDEF");
		p.fmt.unicode = false;
		p.fmt.uniQuote = false;
		p.fmt.prec = prec;
		p.fmt.precPresent = precPresent;
		p.fmt.sharp = sharp;
	};
	pp.prototype.fmtUnicode = function(v) { return this.$val.fmtUnicode(v); };
	pp.Ptr.prototype.fmtUint64 = function(v, verb, goSyntax) {
		var p, _ref;
		p = this;
		_ref = verb;
		if (_ref === 98) {
			p.fmt.integer(new $Int64(v.$high, v.$low), new $Uint64(0, 2), false, "0123456789abcdef");
		} else if (_ref === 99) {
			p.fmtC(new $Int64(v.$high, v.$low));
		} else if (_ref === 100) {
			p.fmt.integer(new $Int64(v.$high, v.$low), new $Uint64(0, 10), false, "0123456789abcdef");
		} else if (_ref === 118) {
			if (goSyntax) {
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
	pp.prototype.fmtUint64 = function(v, verb, goSyntax) { return this.$val.fmtUint64(v, verb, goSyntax); };
	pp.Ptr.prototype.fmtFloat32 = function(v, verb) {
		var p, _ref;
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
	pp.Ptr.prototype.fmtFloat64 = function(v, verb) {
		var p, _ref;
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
	pp.Ptr.prototype.fmtComplex64 = function(v, verb) {
		var p, _ref;
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
	pp.Ptr.prototype.fmtComplex128 = function(v, verb) {
		var p, _ref;
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
	pp.Ptr.prototype.fmtString = function(v, verb, goSyntax) {
		var p, _ref;
		p = this;
		_ref = verb;
		if (_ref === 118) {
			if (goSyntax) {
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
	pp.prototype.fmtString = function(v, verb, goSyntax) { return this.$val.fmtString(v, verb, goSyntax); };
	pp.Ptr.prototype.fmtBytes = function(v, verb, goSyntax, typ, depth) {
		var p, _ref, _i, i, c, _ref$1;
		p = this;
		if ((verb === 118) || (verb === 100)) {
			if (goSyntax) {
				if (v === ($sliceType($Uint8)).nil) {
					if ($interfaceIsEqual(typ, null)) {
						new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteString("[]byte(nil)");
					} else {
						new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteString(typ.String());
						new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).Write(nilParenBytes);
					}
					return;
				}
				if ($interfaceIsEqual(typ, null)) {
					new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).Write(bytesBytes);
				} else {
					new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteString(typ.String());
					new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(123);
				}
			} else {
				new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(91);
			}
			_ref = v;
			_i = 0;
			while (_i < _ref.$length) {
				i = _i;
				c = ((_i < 0 || _i >= _ref.$length) ? $throwRuntimeError("index out of range") : _ref.$array[_ref.$offset + _i]);
				if (i > 0) {
					if (goSyntax) {
						new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).Write(commaSpaceBytes);
					} else {
						new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(32);
					}
				}
				p.printArg(new $Uint8(c), 118, p.fmt.plus, goSyntax, depth + 1 >> 0);
				_i++;
			}
			if (goSyntax) {
				new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(125);
			} else {
				new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(93);
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
	pp.prototype.fmtBytes = function(v, verb, goSyntax, typ, depth) { return this.$val.fmtBytes(v, verb, goSyntax, typ, depth); };
	pp.Ptr.prototype.fmtPointer = function(value, verb, goSyntax) {
		var p, use0x64, _ref, u, _ref$1;
		p = this;
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
		if (goSyntax) {
			p.add(40);
			new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteString(value.Type().String());
			p.add(41);
			p.add(40);
			if (u === 0) {
				new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).Write(nilBytes);
			} else {
				p.fmt0x64(new $Uint64(0, u.constructor === Number ? u : 1), true);
			}
			p.add(41);
		} else if ((verb === 118) && (u === 0)) {
			new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).Write(nilAngleBytes);
		} else {
			if (use0x64) {
				p.fmt0x64(new $Uint64(0, u.constructor === Number ? u : 1), !p.fmt.sharp);
			} else {
				p.fmtUint64(new $Uint64(0, u.constructor === Number ? u : 1), verb, false);
			}
		}
	};
	pp.prototype.fmtPointer = function(value, verb, goSyntax) { return this.$val.fmtPointer(value, verb, goSyntax); };
	pp.Ptr.prototype.catchPanic = function(arg, verb) {
		var p, err, v;
		p = this;
		err = $recover();
		if (!($interfaceIsEqual(err, null))) {
			v = new reflect.Value.Ptr(); $copy(v, reflect.ValueOf(arg), reflect.Value);
			if ((v.Kind() === 22) && v.IsNil()) {
				new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).Write(nilAngleBytes);
				return;
			}
			if (p.panicking) {
				$panic(err);
			}
			new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).Write(percentBangBytes);
			p.add(verb);
			new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).Write(panicBytes);
			p.panicking = true;
			p.printArg(err, 118, false, false, 0);
			p.panicking = false;
			new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(41);
		}
	};
	pp.prototype.catchPanic = function(arg, verb) { return this.$val.catchPanic(arg, verb); };
	pp.Ptr.prototype.handleMethods = function(verb, plus, goSyntax, depth) {
		var wasString = false, handled = false, $deferred = [], $err = null, p, _tuple, x, formatter, ok, _tuple$1, x$1, stringer, ok$1, _ref, v, _ref$1, _type;
		/* */ try { $deferFrames.push($deferred);
		p = this;
		if (p.erroring) {
			return [wasString, handled];
		}
		_tuple = (x = p.arg, (x !== null && Formatter.implementedBy.indexOf(x.constructor) !== -1 ? [x, true] : [null, false])); formatter = _tuple[0]; ok = _tuple[1];
		if (ok) {
			handled = true;
			wasString = false;
			$deferred.push([$methodVal(p, "catchPanic"), [p.arg, verb]]);
			formatter.Format(p, verb);
			return [wasString, handled];
		}
		if (plus) {
			p.fmt.plus = false;
		}
		if (goSyntax) {
			p.fmt.sharp = false;
			_tuple$1 = (x$1 = p.arg, (x$1 !== null && GoStringer.implementedBy.indexOf(x$1.constructor) !== -1 ? [x$1, true] : [null, false])); stringer = _tuple$1[0]; ok$1 = _tuple$1[1];
			if (ok$1) {
				wasString = false;
				handled = true;
				$deferred.push([$methodVal(p, "catchPanic"), [p.arg, verb]]);
				p.fmtString(stringer.GoString(), 115, false);
				return [wasString, handled];
			}
		} else {
			_ref = verb;
			if (_ref === 118 || _ref === 115 || _ref === 120 || _ref === 88 || _ref === 113) {
				_ref$1 = p.arg;
				_type = _ref$1 !== null ? _ref$1.constructor : null;
				if ($error.implementedBy.indexOf(_type) !== -1) {
					v = _ref$1;
					wasString = false;
					handled = true;
					$deferred.push([$methodVal(p, "catchPanic"), [p.arg, verb]]);
					p.printArg(new $String(v.Error()), verb, plus, false, depth);
					return [wasString, handled];
				} else if (Stringer.implementedBy.indexOf(_type) !== -1) {
					v = _ref$1;
					wasString = false;
					handled = true;
					$deferred.push([$methodVal(p, "catchPanic"), [p.arg, verb]]);
					p.printArg(new $String(v.String()), verb, plus, false, depth);
					return [wasString, handled];
				}
			}
		}
		handled = false;
		return [wasString, handled];
		/* */ } catch(err) { $err = err; } finally { $deferFrames.pop(); $callDeferred($deferred, $err); return [wasString, handled]; }
	};
	pp.prototype.handleMethods = function(verb, plus, goSyntax, depth) { return this.$val.handleMethods(verb, plus, goSyntax, depth); };
	pp.Ptr.prototype.printArg = function(arg, verb, plus, goSyntax, depth) {
		var wasString = false, p, _ref, oldPlus, oldSharp, f, _ref$1, _type, _tuple, isString, handled;
		p = this;
		p.arg = arg;
		$copy(p.value, new reflect.Value.Ptr(($ptrType(reflect.rtype)).nil, 0, 0, 0), reflect.Value);
		if ($interfaceIsEqual(arg, null)) {
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
			p.printArg(new $String(reflect.TypeOf(arg).String()), 115, false, false, 0);
			wasString = false;
			return wasString;
		} else if (_ref === 112) {
			p.fmtPointer($clone(reflect.ValueOf(arg), reflect.Value), verb, goSyntax);
			wasString = false;
			return wasString;
		}
		oldPlus = p.fmt.plus;
		oldSharp = p.fmt.sharp;
		if (plus) {
			p.fmt.plus = false;
		}
		if (goSyntax) {
			p.fmt.sharp = false;
		}
		_ref$1 = arg;
		_type = _ref$1 !== null ? _ref$1.constructor : null;
		if (_type === $Bool) {
			f = _ref$1.$val;
			p.fmtBool(f, verb);
		} else if (_type === $Float32) {
			f = _ref$1.$val;
			p.fmtFloat32(f, verb);
		} else if (_type === $Float64) {
			f = _ref$1.$val;
			p.fmtFloat64(f, verb);
		} else if (_type === $Complex64) {
			f = _ref$1.$val;
			p.fmtComplex64(f, verb);
		} else if (_type === $Complex128) {
			f = _ref$1.$val;
			p.fmtComplex128(f, verb);
		} else if (_type === $Int) {
			f = _ref$1.$val;
			p.fmtInt64(new $Int64(0, f), verb);
		} else if (_type === $Int8) {
			f = _ref$1.$val;
			p.fmtInt64(new $Int64(0, f), verb);
		} else if (_type === $Int16) {
			f = _ref$1.$val;
			p.fmtInt64(new $Int64(0, f), verb);
		} else if (_type === $Int32) {
			f = _ref$1.$val;
			p.fmtInt64(new $Int64(0, f), verb);
		} else if (_type === $Int64) {
			f = _ref$1.$val;
			p.fmtInt64(f, verb);
		} else if (_type === $Uint) {
			f = _ref$1.$val;
			p.fmtUint64(new $Uint64(0, f), verb, goSyntax);
		} else if (_type === $Uint8) {
			f = _ref$1.$val;
			p.fmtUint64(new $Uint64(0, f), verb, goSyntax);
		} else if (_type === $Uint16) {
			f = _ref$1.$val;
			p.fmtUint64(new $Uint64(0, f), verb, goSyntax);
		} else if (_type === $Uint32) {
			f = _ref$1.$val;
			p.fmtUint64(new $Uint64(0, f), verb, goSyntax);
		} else if (_type === $Uint64) {
			f = _ref$1.$val;
			p.fmtUint64(f, verb, goSyntax);
		} else if (_type === $Uintptr) {
			f = _ref$1.$val;
			p.fmtUint64(new $Uint64(0, f.constructor === Number ? f : 1), verb, goSyntax);
		} else if (_type === $String) {
			f = _ref$1.$val;
			p.fmtString(f, verb, goSyntax);
			wasString = (verb === 115) || (verb === 118);
		} else if (_type === ($sliceType($Uint8))) {
			f = _ref$1.$val;
			p.fmtBytes(f, verb, goSyntax, null, depth);
			wasString = verb === 115;
		} else {
			f = _ref$1;
			p.fmt.plus = oldPlus;
			p.fmt.sharp = oldSharp;
			_tuple = p.handleMethods(verb, plus, goSyntax, depth); isString = _tuple[0]; handled = _tuple[1];
			if (handled) {
				wasString = isString;
				return wasString;
			}
			wasString = p.printReflectValue($clone(reflect.ValueOf(arg), reflect.Value), verb, plus, goSyntax, depth);
			return wasString;
		}
		p.arg = null;
		return wasString;
	};
	pp.prototype.printArg = function(arg, verb, plus, goSyntax, depth) { return this.$val.printArg(arg, verb, plus, goSyntax, depth); };
	pp.Ptr.prototype.printValue = function(value, verb, plus, goSyntax, depth) {
		var wasString = false, p, _ref, _tuple, isString, handled;
		p = this;
		if (!value.IsValid()) {
			if ((verb === 84) || (verb === 118)) {
				new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).Write(nilAngleBytes);
			} else {
				p.badVerb(verb);
			}
			wasString = false;
			return wasString;
		}
		_ref = verb;
		if (_ref === 84) {
			p.printArg(new $String(value.Type().String()), 115, false, false, 0);
			wasString = false;
			return wasString;
		} else if (_ref === 112) {
			p.fmtPointer($clone(value, reflect.Value), verb, goSyntax);
			wasString = false;
			return wasString;
		}
		p.arg = null;
		if (value.CanInterface()) {
			p.arg = value.Interface();
		}
		_tuple = p.handleMethods(verb, plus, goSyntax, depth); isString = _tuple[0]; handled = _tuple[1];
		if (handled) {
			wasString = isString;
			return wasString;
		}
		wasString = p.printReflectValue($clone(value, reflect.Value), verb, plus, goSyntax, depth);
		return wasString;
	};
	pp.prototype.printValue = function(value, verb, plus, goSyntax, depth) { return this.$val.printValue(value, verb, plus, goSyntax, depth); };
	pp.Ptr.prototype.printReflectValue = function(value, verb, plus, goSyntax, depth) {
		var wasString = false, p, oldValue, f, _ref, x, keys, _ref$1, _i, i, key, v, t, i$1, f$1, value$1, typ, bytes, _ref$2, _i$1, i$2, i$3, v$1, a, _ref$3;
		p = this;
		oldValue = new reflect.Value.Ptr(); $copy(oldValue, p.value, reflect.Value);
		$copy(p.value, value, reflect.Value);
		f = new reflect.Value.Ptr(); $copy(f, value, reflect.Value);
		_ref = f.Kind();
		BigSwitch:
		switch (0) { default: if (_ref === 1) {
			p.fmtBool(f.Bool(), verb);
		} else if (_ref === 2 || _ref === 3 || _ref === 4 || _ref === 5 || _ref === 6) {
			p.fmtInt64(f.Int(), verb);
		} else if (_ref === 7 || _ref === 8 || _ref === 9 || _ref === 10 || _ref === 11 || _ref === 12) {
			p.fmtUint64(f.Uint(), verb, goSyntax);
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
			p.fmtString(f.String(), verb, goSyntax);
		} else if (_ref === 21) {
			if (goSyntax) {
				new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteString(f.Type().String());
				if (f.IsNil()) {
					new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteString("(nil)");
					break;
				}
				new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(123);
			} else {
				new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).Write(mapBytes);
			}
			keys = f.MapKeys();
			_ref$1 = keys;
			_i = 0;
			while (_i < _ref$1.$length) {
				i = _i;
				key = new reflect.Value.Ptr(); $copy(key, ((_i < 0 || _i >= _ref$1.$length) ? $throwRuntimeError("index out of range") : _ref$1.$array[_ref$1.$offset + _i]), reflect.Value);
				if (i > 0) {
					if (goSyntax) {
						new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).Write(commaSpaceBytes);
					} else {
						new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(32);
					}
				}
				p.printValue($clone(key, reflect.Value), verb, plus, goSyntax, depth + 1 >> 0);
				new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(58);
				p.printValue($clone(f.MapIndex($clone(key, reflect.Value)), reflect.Value), verb, plus, goSyntax, depth + 1 >> 0);
				_i++;
			}
			if (goSyntax) {
				new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(125);
			} else {
				new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(93);
			}
		} else if (_ref === 25) {
			if (goSyntax) {
				new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteString(value.Type().String());
			}
			p.add(123);
			v = new reflect.Value.Ptr(); $copy(v, f, reflect.Value);
			t = v.Type();
			i$1 = 0;
			while (i$1 < v.NumField()) {
				if (i$1 > 0) {
					if (goSyntax) {
						new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).Write(commaSpaceBytes);
					} else {
						new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(32);
					}
				}
				if (plus || goSyntax) {
					f$1 = new reflect.StructField.Ptr(); $copy(f$1, t.Field(i$1), reflect.StructField);
					if (!(f$1.Name === "")) {
						new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteString(f$1.Name);
						new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(58);
					}
				}
				p.printValue($clone(getField($clone(v, reflect.Value), i$1), reflect.Value), verb, plus, goSyntax, depth + 1 >> 0);
				i$1 = i$1 + (1) >> 0;
			}
			new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(125);
		} else if (_ref === 20) {
			value$1 = new reflect.Value.Ptr(); $copy(value$1, f.Elem(), reflect.Value);
			if (!value$1.IsValid()) {
				if (goSyntax) {
					new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteString(f.Type().String());
					new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).Write(nilParenBytes);
				} else {
					new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).Write(nilAngleBytes);
				}
			} else {
				wasString = p.printValue($clone(value$1, reflect.Value), verb, plus, goSyntax, depth + 1 >> 0);
			}
		} else if (_ref === 17 || _ref === 23) {
			typ = f.Type();
			if (typ.Elem().Kind() === 8) {
				bytes = ($sliceType($Uint8)).nil;
				if (f.Kind() === 23) {
					bytes = f.Bytes();
				} else if (f.CanAddr()) {
					bytes = f.Slice(0, f.Len()).Bytes();
				} else {
					bytes = ($sliceType($Uint8)).make(f.Len());
					_ref$2 = bytes;
					_i$1 = 0;
					while (_i$1 < _ref$2.$length) {
						i$2 = _i$1;
						(i$2 < 0 || i$2 >= bytes.$length) ? $throwRuntimeError("index out of range") : bytes.$array[bytes.$offset + i$2] = (f.Index(i$2).Uint().$low << 24 >>> 24);
						_i$1++;
					}
				}
				p.fmtBytes(bytes, verb, goSyntax, typ, depth);
				wasString = verb === 115;
				break;
			}
			if (goSyntax) {
				new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteString(value.Type().String());
				if ((f.Kind() === 23) && f.IsNil()) {
					new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteString("(nil)");
					break;
				}
				new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(123);
			} else {
				new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(91);
			}
			i$3 = 0;
			while (i$3 < f.Len()) {
				if (i$3 > 0) {
					if (goSyntax) {
						new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).Write(commaSpaceBytes);
					} else {
						new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(32);
					}
				}
				p.printValue($clone(f.Index(i$3), reflect.Value), verb, plus, goSyntax, depth + 1 >> 0);
				i$3 = i$3 + (1) >> 0;
			}
			if (goSyntax) {
				new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(125);
			} else {
				new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(93);
			}
		} else if (_ref === 22) {
			v$1 = f.Pointer();
			if (!((v$1 === 0)) && (depth === 0)) {
				a = new reflect.Value.Ptr(); $copy(a, f.Elem(), reflect.Value);
				_ref$3 = a.Kind();
				if (_ref$3 === 17 || _ref$3 === 23) {
					new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(38);
					p.printValue($clone(a, reflect.Value), verb, plus, goSyntax, depth + 1 >> 0);
					break BigSwitch;
				} else if (_ref$3 === 25) {
					new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(38);
					p.printValue($clone(a, reflect.Value), verb, plus, goSyntax, depth + 1 >> 0);
					break BigSwitch;
				}
			}
			p.fmtPointer($clone(value, reflect.Value), verb, goSyntax);
		} else if (_ref === 18 || _ref === 19 || _ref === 26) {
			p.fmtPointer($clone(value, reflect.Value), verb, goSyntax);
		} else {
			p.unknownType(new f.constructor.Struct(f));
		} }
		$copy(p.value, oldValue, reflect.Value);
		wasString = wasString;
		return wasString;
	};
	pp.prototype.printReflectValue = function(value, verb, plus, goSyntax, depth) { return this.$val.printReflectValue(value, verb, plus, goSyntax, depth); };
	pp.Ptr.prototype.doPrint = function(a, addspace, addnewline) {
		var p, prevString, argNum, arg, isString;
		p = this;
		prevString = false;
		argNum = 0;
		while (argNum < a.$length) {
			p.fmt.clearflags();
			arg = ((argNum < 0 || argNum >= a.$length) ? $throwRuntimeError("index out of range") : a.$array[a.$offset + argNum]);
			if (argNum > 0) {
				isString = !($interfaceIsEqual(arg, null)) && (reflect.TypeOf(arg).Kind() === 24);
				if (addspace || !isString && !prevString) {
					new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(32);
				}
			}
			prevString = p.printArg(arg, 118, false, false, 0);
			argNum = argNum + (1) >> 0;
		}
		if (addnewline) {
			new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, p).WriteByte(10);
		}
	};
	pp.prototype.doPrint = function(a, addspace, addnewline) { return this.$val.doPrint(a, addspace, addnewline); };
	ss.Ptr.prototype.Read = function(buf) {
		var n = 0, err = null, s, _tmp, _tmp$1;
		s = this;
		_tmp = 0; _tmp$1 = errors.New("ScanState's Read should not be called. Use ReadRune"); n = _tmp; err = _tmp$1;
		return [n, err];
	};
	ss.prototype.Read = function(buf) { return this.$val.Read(buf); };
	ss.Ptr.prototype.ReadRune = function() {
		var r = 0, size = 0, err = null, s, _tuple;
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
		if ($interfaceIsEqual(err, null)) {
			s.count = s.count + (1) >> 0;
			s.prevRune = r;
		} else if ($interfaceIsEqual(err, io.EOF)) {
			s.atEOF = true;
		}
		return [r, size, err];
	};
	ss.prototype.ReadRune = function() { return this.$val.ReadRune(); };
	ss.Ptr.prototype.Width = function() {
		var wid = 0, ok = false, s, _tmp, _tmp$1, _tmp$2, _tmp$3;
		s = this;
		if (s.ssave.maxWid === 1073741824) {
			_tmp = 0; _tmp$1 = false; wid = _tmp; ok = _tmp$1;
			return [wid, ok];
		}
		_tmp$2 = s.ssave.maxWid; _tmp$3 = true; wid = _tmp$2; ok = _tmp$3;
		return [wid, ok];
	};
	ss.prototype.Width = function() { return this.$val.Width(); };
	ss.Ptr.prototype.getRune = function() {
		var r = 0, s, _tuple, err;
		s = this;
		_tuple = s.ReadRune(); r = _tuple[0]; err = _tuple[2];
		if (!($interfaceIsEqual(err, null))) {
			if ($interfaceIsEqual(err, io.EOF)) {
				r = -1;
				return r;
			}
			s.error(err);
		}
		return r;
	};
	ss.prototype.getRune = function() { return this.$val.getRune(); };
	ss.Ptr.prototype.UnreadRune = function() {
		var s, _tuple, x, u, ok;
		s = this;
		_tuple = (x = s.rr, (x !== null && runeUnreader.implementedBy.indexOf(x.constructor) !== -1 ? [x, true] : [null, false])); u = _tuple[0]; ok = _tuple[1];
		if (ok) {
			u.UnreadRune();
		} else {
			s.peekRune = s.prevRune;
		}
		s.prevRune = -1;
		s.count = s.count - (1) >> 0;
		return null;
	};
	ss.prototype.UnreadRune = function() { return this.$val.UnreadRune(); };
	ss.Ptr.prototype.error = function(err) {
		var s, x;
		s = this;
		$panic((x = new scanError.Ptr(err), new x.constructor.Struct(x)));
	};
	ss.prototype.error = function(err) { return this.$val.error(err); };
	ss.Ptr.prototype.errorString = function(err) {
		var s, x;
		s = this;
		$panic((x = new scanError.Ptr(errors.New(err)), new x.constructor.Struct(x)));
	};
	ss.prototype.errorString = function(err) { return this.$val.errorString(err); };
	ss.Ptr.prototype.Token = function(skipSpace, f) {
		var tok = ($sliceType($Uint8)).nil, err = null, $deferred = [], $err = null, s;
		/* */ try { $deferFrames.push($deferred);
		s = this;
		$deferred.push([(function() {
			var e, _tuple, se, ok;
			e = $recover();
			if (!($interfaceIsEqual(e, null))) {
				_tuple = (e !== null && e.constructor === scanError ? [e.$val, true] : [new scanError.Ptr(), false]); se = new scanError.Ptr(); $copy(se, _tuple[0], scanError); ok = _tuple[1];
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
		var rx, _ref, _i, rng;
		if (r >= 65536) {
			return false;
		}
		rx = (r << 16 >>> 16);
		_ref = space;
		_i = 0;
		while (_i < _ref.$length) {
			rng = ($arrayType($Uint16, 2)).zero(); $copy(rng, ((_i < 0 || _i >= _ref.$length) ? $throwRuntimeError("index out of range") : _ref.$array[_ref.$offset + _i]), ($arrayType($Uint16, 2)));
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
		return !isSpace(r);
	};
	ss.Ptr.prototype.SkipSpace = function() {
		var s;
		s = this;
		s.skipSpace(false);
	};
	ss.prototype.SkipSpace = function() { return this.$val.SkipSpace(); };
	ss.Ptr.prototype.free = function(old) {
		var s;
		s = this;
		if (old.validSave) {
			$copy(s.ssave, old, ssave);
			return;
		}
		if (s.buf.$capacity > 1024) {
			return;
		}
		s.buf = $subslice(s.buf, 0, 0);
		s.rr = null;
		ssFree.Put(s);
	};
	ss.prototype.free = function(old) { return this.$val.free(old); };
	ss.Ptr.prototype.skipSpace = function(stopAtNewline) {
		var s, r;
		s = this;
		while (true) {
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
	ss.Ptr.prototype.token = function(skipSpace, f) {
		var s, r, x;
		s = this;
		if (skipSpace) {
			s.skipSpace(false);
		}
		while (true) {
			r = s.getRune();
			if (r === -1) {
				break;
			}
			if (!f(r)) {
				s.UnreadRune();
				break;
			}
			new ($ptrType(buffer))(function() { return this.$target.buf; }, function($v) { this.$target.buf = $v; }, s).WriteRune(r);
		}
		return (x = s.buf, $subslice(new ($sliceType($Uint8))(x.$array), x.$offset, x.$offset + x.$length));
	};
	ss.prototype.token = function(skipSpace, f) { return this.$val.token(skipSpace, f); };
	indexRune = function(s, r) {
		var _ref, _i, _rune, i, c;
		_ref = s;
		_i = 0;
		while (_i < _ref.length) {
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
	ss.Ptr.prototype.peek = function(ok) {
		var s, r;
		s = this;
		r = s.getRune();
		if (!((r === -1))) {
			s.UnreadRune();
		}
		return indexRune(ok, r) >= 0;
	};
	ss.prototype.peek = function(ok) { return this.$val.peek(ok); };
	$pkg.$init = function() {
		($ptrType(fmt)).methods = [["clearflags", "clearflags", "fmt", [], [], false, -1], ["computePadding", "computePadding", "fmt", [$Int], [($sliceType($Uint8)), $Int, $Int], false, -1], ["fmt_E32", "fmt_E32", "fmt", [$Float32], [], false, -1], ["fmt_E64", "fmt_E64", "fmt", [$Float64], [], false, -1], ["fmt_G32", "fmt_G32", "fmt", [$Float32], [], false, -1], ["fmt_G64", "fmt_G64", "fmt", [$Float64], [], false, -1], ["fmt_boolean", "fmt_boolean", "fmt", [$Bool], [], false, -1], ["fmt_bx", "fmt_bx", "fmt", [($sliceType($Uint8)), $String], [], false, -1], ["fmt_c128", "fmt_c128", "fmt", [$Complex128, $Int32], [], false, -1], ["fmt_c64", "fmt_c64", "fmt", [$Complex64, $Int32], [], false, -1], ["fmt_complex", "fmt_complex", "fmt", [$Float64, $Float64, $Int, $Int32], [], false, -1], ["fmt_e32", "fmt_e32", "fmt", [$Float32], [], false, -1], ["fmt_e64", "fmt_e64", "fmt", [$Float64], [], false, -1], ["fmt_f32", "fmt_f32", "fmt", [$Float32], [], false, -1], ["fmt_f64", "fmt_f64", "fmt", [$Float64], [], false, -1], ["fmt_fb32", "fmt_fb32", "fmt", [$Float32], [], false, -1], ["fmt_fb64", "fmt_fb64", "fmt", [$Float64], [], false, -1], ["fmt_g32", "fmt_g32", "fmt", [$Float32], [], false, -1], ["fmt_g64", "fmt_g64", "fmt", [$Float64], [], false, -1], ["fmt_q", "fmt_q", "fmt", [$String], [], false, -1], ["fmt_qc", "fmt_qc", "fmt", [$Int64], [], false, -1], ["fmt_s", "fmt_s", "fmt", [$String], [], false, -1], ["fmt_sbx", "fmt_sbx", "fmt", [$String, ($sliceType($Uint8)), $String], [], false, -1], ["fmt_sx", "fmt_sx", "fmt", [$String, $String], [], false, -1], ["formatFloat", "formatFloat", "fmt", [$Float64, $Uint8, $Int, $Int], [], false, -1], ["init", "init", "fmt", [($ptrType(buffer))], [], false, -1], ["integer", "integer", "fmt", [$Int64, $Uint64, $Bool, $String], [], false, -1], ["pad", "pad", "fmt", [($sliceType($Uint8))], [], false, -1], ["padString", "padString", "fmt", [$String], [], false, -1], ["truncate", "truncate", "fmt", [$String], [$String], false, -1], ["writePadding", "writePadding", "fmt", [$Int, ($sliceType($Uint8))], [], false, -1]];
		fmt.init([["intbuf", "intbuf", "fmt", ($arrayType($Uint8, 65)), ""], ["buf", "buf", "fmt", ($ptrType(buffer)), ""], ["wid", "wid", "fmt", $Int, ""], ["prec", "prec", "fmt", $Int, ""], ["widPresent", "widPresent", "fmt", $Bool, ""], ["precPresent", "precPresent", "fmt", $Bool, ""], ["minus", "minus", "fmt", $Bool, ""], ["plus", "plus", "fmt", $Bool, ""], ["sharp", "sharp", "fmt", $Bool, ""], ["space", "space", "fmt", $Bool, ""], ["unicode", "unicode", "fmt", $Bool, ""], ["uniQuote", "uniQuote", "fmt", $Bool, ""], ["zero", "zero", "fmt", $Bool, ""]]);
		State.init([["Flag", "Flag", "", [$Int], [$Bool], false], ["Precision", "Precision", "", [], [$Int, $Bool], false], ["Width", "Width", "", [], [$Int, $Bool], false], ["Write", "Write", "", [($sliceType($Uint8))], [$Int, $error], false]]);
		Formatter.init([["Format", "Format", "", [State, $Int32], [], false]]);
		Stringer.init([["String", "String", "", [], [$String], false]]);
		GoStringer.init([["GoString", "GoString", "", [], [$String], false]]);
		($ptrType(buffer)).methods = [["Write", "Write", "", [($sliceType($Uint8))], [$Int, $error], false, -1], ["WriteByte", "WriteByte", "", [$Uint8], [$error], false, -1], ["WriteRune", "WriteRune", "", [$Int32], [$error], false, -1], ["WriteString", "WriteString", "", [$String], [$Int, $error], false, -1]];
		buffer.init($Uint8);
		($ptrType(pp)).methods = [["Flag", "Flag", "", [$Int], [$Bool], false, -1], ["Precision", "Precision", "", [], [$Int, $Bool], false, -1], ["Width", "Width", "", [], [$Int, $Bool], false, -1], ["Write", "Write", "", [($sliceType($Uint8))], [$Int, $error], false, -1], ["add", "add", "fmt", [$Int32], [], false, -1], ["argNumber", "argNumber", "fmt", [$Int, $String, $Int, $Int], [$Int, $Int, $Bool], false, -1], ["badVerb", "badVerb", "fmt", [$Int32], [], false, -1], ["catchPanic", "catchPanic", "fmt", [$emptyInterface, $Int32], [], false, -1], ["doPrint", "doPrint", "fmt", [($sliceType($emptyInterface)), $Bool, $Bool], [], false, -1], ["doPrintf", "doPrintf", "fmt", [$String, ($sliceType($emptyInterface))], [], false, -1], ["fmt0x64", "fmt0x64", "fmt", [$Uint64, $Bool], [], false, -1], ["fmtBool", "fmtBool", "fmt", [$Bool, $Int32], [], false, -1], ["fmtBytes", "fmtBytes", "fmt", [($sliceType($Uint8)), $Int32, $Bool, reflect.Type, $Int], [], false, -1], ["fmtC", "fmtC", "fmt", [$Int64], [], false, -1], ["fmtComplex128", "fmtComplex128", "fmt", [$Complex128, $Int32], [], false, -1], ["fmtComplex64", "fmtComplex64", "fmt", [$Complex64, $Int32], [], false, -1], ["fmtFloat32", "fmtFloat32", "fmt", [$Float32, $Int32], [], false, -1], ["fmtFloat64", "fmtFloat64", "fmt", [$Float64, $Int32], [], false, -1], ["fmtInt64", "fmtInt64", "fmt", [$Int64, $Int32], [], false, -1], ["fmtPointer", "fmtPointer", "fmt", [reflect.Value, $Int32, $Bool], [], false, -1], ["fmtString", "fmtString", "fmt", [$String, $Int32, $Bool], [], false, -1], ["fmtUint64", "fmtUint64", "fmt", [$Uint64, $Int32, $Bool], [], false, -1], ["fmtUnicode", "fmtUnicode", "fmt", [$Int64], [], false, -1], ["free", "free", "fmt", [], [], false, -1], ["handleMethods", "handleMethods", "fmt", [$Int32, $Bool, $Bool, $Int], [$Bool, $Bool], false, -1], ["printArg", "printArg", "fmt", [$emptyInterface, $Int32, $Bool, $Bool, $Int], [$Bool], false, -1], ["printReflectValue", "printReflectValue", "fmt", [reflect.Value, $Int32, $Bool, $Bool, $Int], [$Bool], false, -1], ["printValue", "printValue", "fmt", [reflect.Value, $Int32, $Bool, $Bool, $Int], [$Bool], false, -1], ["unknownType", "unknownType", "fmt", [$emptyInterface], [], false, -1]];
		pp.init([["n", "n", "fmt", $Int, ""], ["panicking", "panicking", "fmt", $Bool, ""], ["erroring", "erroring", "fmt", $Bool, ""], ["buf", "buf", "fmt", buffer, ""], ["arg", "arg", "fmt", $emptyInterface, ""], ["value", "value", "fmt", reflect.Value, ""], ["reordered", "reordered", "fmt", $Bool, ""], ["goodArgNum", "goodArgNum", "fmt", $Bool, ""], ["runeBuf", "runeBuf", "fmt", ($arrayType($Uint8, 4)), ""], ["fmt", "fmt", "fmt", fmt, ""]]);
		runeUnreader.init([["UnreadRune", "UnreadRune", "", [], [$error], false]]);
		scanError.init([["err", "err", "fmt", $error, ""]]);
		($ptrType(ss)).methods = [["Read", "Read", "", [($sliceType($Uint8))], [$Int, $error], false, -1], ["ReadRune", "ReadRune", "", [], [$Int32, $Int, $error], false, -1], ["SkipSpace", "SkipSpace", "", [], [], false, -1], ["Token", "Token", "", [$Bool, ($funcType([$Int32], [$Bool], false))], [($sliceType($Uint8)), $error], false, -1], ["UnreadRune", "UnreadRune", "", [], [$error], false, -1], ["Width", "Width", "", [], [$Int, $Bool], false, -1], ["accept", "accept", "fmt", [$String], [$Bool], false, -1], ["advance", "advance", "fmt", [$String], [$Int], false, -1], ["complexTokens", "complexTokens", "fmt", [], [$String, $String], false, -1], ["consume", "consume", "fmt", [$String, $Bool], [$Bool], false, -1], ["convertFloat", "convertFloat", "fmt", [$String, $Int], [$Float64], false, -1], ["convertString", "convertString", "fmt", [$Int32], [$String], false, -1], ["doScan", "doScan", "fmt", [($sliceType($emptyInterface))], [$Int, $error], false, -1], ["doScanf", "doScanf", "fmt", [$String, ($sliceType($emptyInterface))], [$Int, $error], false, -1], ["error", "error", "fmt", [$error], [], false, -1], ["errorString", "errorString", "fmt", [$String], [], false, -1], ["floatToken", "floatToken", "fmt", [], [$String], false, -1], ["free", "free", "fmt", [ssave], [], false, -1], ["getBase", "getBase", "fmt", [$Int32], [$Int, $String], false, -1], ["getRune", "getRune", "fmt", [], [$Int32], false, -1], ["hexByte", "hexByte", "fmt", [], [$Uint8, $Bool], false, -1], ["hexDigit", "hexDigit", "fmt", [$Int32], [$Int], false, -1], ["hexString", "hexString", "fmt", [], [$String], false, -1], ["mustReadRune", "mustReadRune", "fmt", [], [$Int32], false, -1], ["notEOF", "notEOF", "fmt", [], [], false, -1], ["okVerb", "okVerb", "fmt", [$Int32, $String, $String], [$Bool], false, -1], ["peek", "peek", "fmt", [$String], [$Bool], false, -1], ["quotedString", "quotedString", "fmt", [], [$String], false, -1], ["scanBasePrefix", "scanBasePrefix", "fmt", [], [$Int, $String, $Bool], false, -1], ["scanBool", "scanBool", "fmt", [$Int32], [$Bool], false, -1], ["scanComplex", "scanComplex", "fmt", [$Int32, $Int], [$Complex128], false, -1], ["scanInt", "scanInt", "fmt", [$Int32, $Int], [$Int64], false, -1], ["scanNumber", "scanNumber", "fmt", [$String, $Bool], [$String], false, -1], ["scanOne", "scanOne", "fmt", [$Int32, $emptyInterface], [], false, -1], ["scanRune", "scanRune", "fmt", [$Int], [$Int64], false, -1], ["scanUint", "scanUint", "fmt", [$Int32, $Int], [$Uint64], false, -1], ["skipSpace", "skipSpace", "fmt", [$Bool], [], false, -1], ["token", "token", "fmt", [$Bool, ($funcType([$Int32], [$Bool], false))], [($sliceType($Uint8))], false, -1]];
		ss.init([["rr", "rr", "fmt", io.RuneReader, ""], ["buf", "buf", "fmt", buffer, ""], ["peekRune", "peekRune", "fmt", $Int32, ""], ["prevRune", "prevRune", "fmt", $Int32, ""], ["count", "count", "fmt", $Int, ""], ["atEOF", "atEOF", "fmt", $Bool, ""], ["ssave", "", "fmt", ssave, ""]]);
		ssave.init([["validSave", "validSave", "fmt", $Bool, ""], ["nlIsEnd", "nlIsEnd", "fmt", $Bool, ""], ["nlIsSpace", "nlIsSpace", "fmt", $Bool, ""], ["argLimit", "argLimit", "fmt", $Int, ""], ["limit", "limit", "fmt", $Int, ""], ["maxWid", "maxWid", "fmt", $Int, ""]]);
		padZeroBytes = ($sliceType($Uint8)).make(65);
		padSpaceBytes = ($sliceType($Uint8)).make(65);
		trueBytes = new ($sliceType($Uint8))($stringToBytes("true"));
		falseBytes = new ($sliceType($Uint8))($stringToBytes("false"));
		commaSpaceBytes = new ($sliceType($Uint8))($stringToBytes(", "));
		nilAngleBytes = new ($sliceType($Uint8))($stringToBytes("<nil>"));
		nilParenBytes = new ($sliceType($Uint8))($stringToBytes("(nil)"));
		nilBytes = new ($sliceType($Uint8))($stringToBytes("nil"));
		mapBytes = new ($sliceType($Uint8))($stringToBytes("map["));
		percentBangBytes = new ($sliceType($Uint8))($stringToBytes("%!"));
		panicBytes = new ($sliceType($Uint8))($stringToBytes("(PANIC="));
		irparenBytes = new ($sliceType($Uint8))($stringToBytes("i)"));
		bytesBytes = new ($sliceType($Uint8))($stringToBytes("[]byte{"));
		ppFree = new sync.Pool.Ptr(0, 0, ($sliceType($emptyInterface)).nil, (function() {
			return new pp.Ptr();
		}));
		intBits = reflect.TypeOf(new $Int(0)).Bits();
		uintptrBits = reflect.TypeOf(new $Uintptr(0)).Bits();
		space = new ($sliceType(($arrayType($Uint16, 2))))([$toNativeArray("Uint16", [9, 13]), $toNativeArray("Uint16", [32, 32]), $toNativeArray("Uint16", [133, 133]), $toNativeArray("Uint16", [160, 160]), $toNativeArray("Uint16", [5760, 5760]), $toNativeArray("Uint16", [8192, 8202]), $toNativeArray("Uint16", [8232, 8233]), $toNativeArray("Uint16", [8239, 8239]), $toNativeArray("Uint16", [8287, 8287]), $toNativeArray("Uint16", [12288, 12288])]);
		ssFree = new sync.Pool.Ptr(0, 0, ($sliceType($emptyInterface)).nil, (function() {
			return new ss.Ptr();
		}));
		complexError = errors.New("syntax error scanning complex number");
		boolError = errors.New("syntax error scanning boolean");
		init();
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
	var $pkg = {}, fmt = $packages["fmt"], js = $packages["github.com/gopherjs/gopherjs/js"], webgl = $packages["github.com/gopherjs/webgl"], mouse, debug, Tick, handleMouseMove, main;
	Tick = $pkg.Tick = function() {
		debug.textContent = $externalize(fmt.Sprintln(new ($sliceType($emptyInterface))([new $String("mouse:"), new ($arrayType($Int, 2))(mouse)])), $String);
		$global.requestAnimationFrame($externalize(Tick, ($funcType([], [], false))));
	};
	handleMouseMove = function(event) {
		mouse[0] = $parseInt(event.clientX) >> 0;
		mouse[1] = $parseInt(event.clientY) >> 0;
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
		debug = document.createElement($externalize("div", $String));
		document.body.appendChild(debug);
		document.onmousemove = $externalize(handleMouseMove, ($funcType([js.Object], [], false)));
		$global.requestAnimationFrame($externalize(Tick, ($funcType([], [], false))));
	};
	$pkg.$run = function($b) {
		$packages["github.com/gopherjs/gopherjs/js"].$init();
		$packages["runtime"].$init();
		$packages["errors"].$init();
		$packages["sync/atomic"].$init();
		$packages["sync"].$init();
		$packages["io"].$init();
		$packages["math"].$init();
		$packages["unicode"].$init();
		$packages["unicode/utf8"].$init();
		$packages["bytes"].$init();
		$packages["syscall"].$init();
		$packages["strings"].$init();
		$packages["time"].$init();
		$packages["os"].$init();
		$packages["strconv"].$init();
		$packages["reflect"].$init();
		$packages["fmt"].$init();
		$packages["github.com/gopherjs/webgl"].$init();
		$pkg.$init();
		main();
	};
	$pkg.$init = function() {
		mouse = ($arrayType($Int, 2)).zero();
		debug = null;
	};
	return $pkg;
})();
$error.implementedBy = [$packages["errors"].errorString.Ptr, $packages["github.com/gopherjs/gopherjs/js"].Error.Ptr, $packages["os"].LinkError.Ptr, $packages["os"].PathError.Ptr, $packages["os"].SyscallError.Ptr, $packages["reflect"].ValueError.Ptr, $packages["runtime"].NotSupportedError.Ptr, $packages["runtime"].TypeAssertionError.Ptr, $packages["runtime"].errorString, $packages["syscall"].Errno, $packages["time"].ParseError.Ptr, $ptrType($packages["runtime"].errorString), $ptrType($packages["syscall"].Errno)];
$packages["github.com/gopherjs/gopherjs/js"].Object.implementedBy = [$packages["github.com/gopherjs/gopherjs/js"].Error, $packages["github.com/gopherjs/gopherjs/js"].Error.Ptr, $packages["github.com/gopherjs/webgl"].Context, $packages["github.com/gopherjs/webgl"].Context.Ptr];
$packages["sync"].Locker.implementedBy = [$packages["sync"].Mutex.Ptr, $packages["sync"].RWMutex.Ptr, $packages["sync"].poolLocal.Ptr, $packages["sync"].rlocker.Ptr, $packages["syscall"].mmapper.Ptr];
$packages["io"].RuneReader.implementedBy = [$packages["fmt"].ss.Ptr];
$packages["os"].FileInfo.implementedBy = [$packages["os"].fileStat.Ptr];
$packages["reflect"].Type.implementedBy = [$packages["reflect"].arrayType.Ptr, $packages["reflect"].chanType.Ptr, $packages["reflect"].funcType.Ptr, $packages["reflect"].interfaceType.Ptr, $packages["reflect"].mapType.Ptr, $packages["reflect"].ptrType.Ptr, $packages["reflect"].rtype.Ptr, $packages["reflect"].sliceType.Ptr, $packages["reflect"].structType.Ptr];
$packages["fmt"].Formatter.implementedBy = [];
$packages["fmt"].GoStringer.implementedBy = [];
$packages["fmt"].State.implementedBy = [$packages["fmt"].pp.Ptr];
$packages["fmt"].Stringer.implementedBy = [$packages["os"].FileMode, $packages["reflect"].ChanDir, $packages["reflect"].Kind, $packages["reflect"].Value, $packages["reflect"].Value.Ptr, $packages["reflect"].arrayType.Ptr, $packages["reflect"].chanType.Ptr, $packages["reflect"].funcType.Ptr, $packages["reflect"].interfaceType.Ptr, $packages["reflect"].mapType.Ptr, $packages["reflect"].ptrType.Ptr, $packages["reflect"].rtype.Ptr, $packages["reflect"].sliceType.Ptr, $packages["reflect"].structType.Ptr, $packages["strconv"].decimal.Ptr, $packages["time"].Duration, $packages["time"].Location.Ptr, $packages["time"].Month, $packages["time"].Time, $packages["time"].Time.Ptr, $packages["time"].Weekday, $ptrType($packages["os"].FileMode), $ptrType($packages["reflect"].ChanDir), $ptrType($packages["reflect"].Kind), $ptrType($packages["time"].Duration), $ptrType($packages["time"].Month), $ptrType($packages["time"].Weekday)];
$packages["fmt"].runeUnreader.implementedBy = [$packages["fmt"].ss.Ptr];
$go($packages["main"].$run, [], true);

})();
//# sourceMappingURL=main.js.map
