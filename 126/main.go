// Play with finding discontinuities on a func via binary search.
package main

import (
	"fmt"
	"math"
	"sort"
	"time"

	"github.com/dustin/go-humanize"
)

func foo(then, now time.Time) string {
	/*if now.Sub(then) < time.Minute {
		return "less than a minute ago"
	}*/
	return humanize.RelTime(then, now, "ago", "from now")
}

// F is the func being tested for discontinuities, lowest i where the F(i) output is different than F(i-1).
func F(i int) string {
	return foo(time.Unix(0, 0), time.Unix(0, int64(i)))
}

func main() {
	offset := 0
	base := F(offset)

	for n := 0; n < 70; n++ {
		fmt.Println(offset, base)

		offset += sort.Search(
			math.MaxInt64-offset,
			func(i int) bool {
				return F(offset+i) != base
			},
		)
		base = F(offset)
	}
}
