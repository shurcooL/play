package impl

import "github.com/shurcooL/play/212/iface"

type FooImpl int

func MakeFoo() iface.Foo {
	return FooImpl(0)
}

func (f FooImpl) Bar() int {
	return 42
}
