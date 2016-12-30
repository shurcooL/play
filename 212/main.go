// Reproduce case for GopherJS using stale archives when build fails,
// see https://github.com/gopherjs/gopherjs/issues/559.
package main

import (
	"fmt"

	"github.com/shurcooL/play/212/impl"
)

func main() {
	fmt.Println(impl.MakeFoo().Bar())
}
