// Look at time it takes to decode some simple JSON.
package main

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

func main() {
	r := strings.NewReader(`[
		{"Name": "Platypus", "Order": "Monotremata"},
		{"Name": "Quoll",    "Order": "Dasyuromorphia"}
	]`)
	type Animal struct {
		Name  string
		Order string
	}
	var animals []Animal
	t0 := time.Now()
	err := json.NewDecoder(r).Decode(&animals)
	if err != nil {
		fmt.Println("error:", err)
	}
	fmt.Println("taken:", time.Since(t0))
	fmt.Printf("%+v\n", animals)

	// Output:
	// taken: 82.346µs (on desktop)
	// taken: 33ms (in browser)
}
