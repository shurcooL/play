// Expose private values, by rogpeppe.
package main

import (
	"fmt"
	"reflect"
	"unsafe"
)

type Foo int

func (f Foo) String() string {
	return "foo"
}

type T struct {
	x Foo
}

func main() {
	t := &T{123}
	tv := reflect.ValueOf(t).Elem().FieldByName("x").Addr()
	fmt.Printf("%v\n", bypass(tv).Interface())
}

var flagValOffset = func() uintptr {
	field, ok := reflect.TypeOf(reflect.Value{}).FieldByName("flag")
	if !ok {
		panic("reflect.Value has no flag field")
	}
	return field.Offset
}()

type flag uintptr

// copied from reflect/value.go
const (
	flagRO flag = 1 << iota
	flagIndir
	flagAddr
	flagMethod
	flagKindShift        = iota
	flagKindWidth        = 5 // there are 27 kinds
	flagKindMask    flag = 1<<flagKindWidth - 1
	flagMethodShift      = flagKindShift + flagKindWidth
)

// Go 1.4.
const flagROgo14 flag = 1 << 5

func bypass(v reflect.Value) reflect.Value {
	if !v.IsValid() || v.CanInterface() {
		return v
	}
	flagp := (*flag)(unsafe.Pointer(uintptr(unsafe.Pointer(&v)) + flagValOffset))
	//*flagp &^= flagRO
	*flagp &^= flagROgo14
	return v
}
