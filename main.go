package main

import (
	"github.com/shurcooL/go-goon"
	"github.com/davecgh/go-spew/spew"
	"time"
	"fmt"
)

var _= fmt.Printf
var _ = time.Now
var _ = goon.Dump
var _ = spew.Dump

func main() {
	tu := int64(1365281459)

	t := time.Unix(tu, 0)
	now := time.Now()

	goon.Dump(t.Format("Monday, 2 January, 2006, 3:04:05 PM -0700 MST"))
	goon.Dump(now.Sub(t).String())
}