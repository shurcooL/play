// Learn about https://github.com/gopherjs/gopherjs/issues/287.
package main

import (
	"fmt"
	"time"

	"github.com/gopherjs/gopherjs/js"
)

func Foo(x string) {
	fmt.Println(x)
}

func Bar(x []int) {
	fmt.Println(x)
}

func Baz(x time.Time) {
	//fmt.Println(time.Now())
	fmt.Println(x)
}

func main() {
	js.Global.Set("Foo", Foo)
	js.Global.Set("Bar", Bar)
	js.Global.Set("Baz", Baz)

	/*Foo("hello")

	Bar([]int{1, 2, 3})

	Baz(time.Now())*/

	date := js.Global.Get("Date").New().Interface().(time.Time)
	fmt.Println(date)
}

/*

var $newType = function(size, kind, string, name, pkg, constructor) {

	$newType(size: 0, kind: $kindStruct, string: "time.Time", name: "Time", pkg: "time", constructor: function(sec_, nsec_, loc_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.sec = new $Int64(0, 0);
			this.nsec = 0;
			this.loc = ptrType$1.nil;
			return;
		}
		this.sec = sec_;
		this.nsec = nsec_;
		this.loc = loc_;
	});

*/
