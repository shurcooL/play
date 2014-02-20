package main

import (
	"os"
	"strings"

	. "gist.github.com/5286084.git"
	"gist.github.com/7651991.git"
	"github.com/shurcooL/go-goon"
)

func main() {
	songs, err := os.Open("/Users/Dmitri/Dropbox/Text Files/Songs.txt")
	CheckError(err)

	m := map[int]int{}      // number of elements per line -> count of lines
	d := map[int][]string{} // number of elements per line -> lines themselves

	processFunc := func(line string) {
		splits := strings.Split(line, " - ")
		numElems := len(splits)
		if !strings.HasPrefix(splits[len(splits)-1], "http") {
			numElems++
		}

		m[numElems]++
		d[numElems] = append(d[numElems], line)
	}

	gist7651991.ProcessLinesFromReader(songs, processFunc)

	goon.DumpExpr(m)
	goon.DumpExpr(d[2])
	goon.DumpExpr(d[4])
}
