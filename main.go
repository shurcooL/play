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
	//tu := int64(1365281459)
	tu := int64(1366540934)

	t := time.Unix(tu, 0)
	now := time.Now()

	goon.Dump(t.Format("3:04:05 PM - 2 Jan, 2006"))
	goon.Dump(t.Format("2006-03-02 15:04:05 PM"))
	goon.Dump(now.Sub(t).String() + " ago")
}