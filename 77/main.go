package main

import (
	"fmt"
	"reflect"

	bypass_new "github.com/shurcooL/go-goon/bypass"
	bypass_alt "github.com/shurcooL/go-goon/bypass_alt"
	bypass_prev "github.com/shurcooL/go-goon/bypass_prev"
)

func main() {
	unexportedFuncStruct := struct {
		unexportedFunc func() string
	}{func() string { return "This is the source of an unexported struct field." }}
	//unexportedFuncStruct := lib.Foo()

	var v reflect.Value = reflect.ValueOf(unexportedFuncStruct)

	//v = bypass_prev.UnsafeReflectValue(v)

	if v.Kind() != reflect.Struct {
		panic("v.Kind() != reflect.Struct")
	}

	if v.NumField() != 1 {
		panic("v.NumField() != 1")
	}

	v = v.Field(0)

	if v.Kind() != reflect.Func {
		panic("v.Kind() != reflect.Func")
	}

	if v.CanInterface() != false {
		panic("v.CanInterface() != false")
	}

	fmt.Println("pointer value with no code:                           ", v.Pointer())
	fmt.Println("pointer value with previous (1.3 only) code:          ", bypass_prev.UnsafeReflectValue(v).Pointer())
	fmt.Println("pointer value with alternative (modify in-place) code:", bypass_alt.UnsafeReflectValue(v).Pointer())
	fmt.Println("pointer value with new code:                          ", bypass_new.UnsafeReflectValue(v).Pointer())
}
