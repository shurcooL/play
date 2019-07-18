package main

import (
	"fmt"
	"reflect"
)

type Iface interface {
	Method()
}
type IfaceAlt interface {
	Method()
}

func Func(Iface) bool {
	return true
}

func main() {
	sa := struct{ X Iface }{}

	v1a := sa.X
	fmt.Println(Func(v1a))

	v2a := reflect.ValueOf(sa).FieldByName("X")
	fmt.Println(reflect.ValueOf(Func).Call([]reflect.Value{v2a})[0])

	sb := struct{ X IfaceAlt }{}

	v1b := sb.X
	fmt.Println(Func(v1b))

	v2b := reflect.ValueOf(sb).FieldByName("X")
	fmt.Println(reflect.ValueOf(Func).Call([]reflect.Value{v2b})[0])
}
