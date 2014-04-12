// Prints a random song from Songs.txt.
package main

import (
	"bytes"
	"fmt"
	"io/ioutil"
	"math/rand"
	"strings"
	"time"
)

func p(line string) {
	line = strings.TrimPrefix(line, "//")
	line = strings.Replace(line, " ft. ", " ", -1)
	splits := strings.Split(line, " - ")
	fmt.Println(splits[0], splits[1])
}

func main() {
	seed := time.Now().UnixNano()
	rand.Seed(seed)
	//fmt.Println(seed)

	b, err := ioutil.ReadFile("/Users/Dmitri/Dropbox/Text Files/Songs.txt")
	if err != nil {
		panic(err)
	}

	// If the last byte is a newline, drop it.
	if len(b) > 0 && b[len(b)-1] == '\n' {
		b = b[:len(b)-1]
	}

	lines := bytes.Split(b, []byte("\n"))

	line := rand.Intn(len(lines))

	p(string(lines[line]))
}
