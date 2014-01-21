package main

import (
	"reflect"

	"github.com/davecgh/go-spew/spew"
	"github.com/shurcooL/go-goon"
)

/*
#include "c.h"
*/
import "C"

var _ = spew.Dump
var _ = goon.Dump

func main() {
	spew.Config.Indent = "\t"
	spew.Config.ContinueOnMethod = true
	spew.Config.DisableMethods = true
	spew.Config.DisablePointerMethods = true

	goon.Dump(C.CoolCFunc())

	spew.Dump(reflect.TypeOf(C.CoolCFunc()))
	//goon.Dump(reflect.TypeOf(C.CoolCFunc()))
}
