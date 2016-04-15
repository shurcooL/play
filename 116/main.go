// Play with "testing/quick".
package main

import (
	"bytes"
	"fmt"
	"math/rand"
	"testing/quick"
	"time"
)

func main() {
	f := func(b []byte) string {
		var buf bytes.Buffer
		for _, line := range bytes.Split(b, []byte("\n")) {
			buf.Write(line)
			buf.WriteString("\n")
		}
		return buf.String()
	}
	g := func(b []byte) string {
		return string(b) + "\n"
	}

	err := quick.CheckEqual(f, g,
		&quick.Config{
			MaxCount: 1000000,
			Rand:     rand.New(rand.NewSource(time.Now().UnixNano())),
		})
	fmt.Println(err)
}
