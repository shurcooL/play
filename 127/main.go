// Play with benchmarking a tight loop with many iterations and a func call, compare gc vs GopherJS performance.
//
// The initial implementation that uses math.Pow.
package main

import (
	"fmt"
	"math"
	"time"
)

func term(k float64) float64 {
	return 4 * math.Pow(-1, k) / (2*k + 1)
}

// pi performs n iterations to compute an approximation of pi using math.Pow.
func pi(n int32) float64 {
	f := 0.0
	for k := int32(0); k <= n; k++ {
		f += term(float64(k))
	}
	return f
}

func main() {
	// Start measuring time from now.
	started := time.Now()

	const n = 50 * 1000 * 1000
	fmt.Printf("approximating pi with %v iterations.\n", n)
	fmt.Println(pi(n))

	fmt.Println("total time taken is:", time.Since(started))
}
