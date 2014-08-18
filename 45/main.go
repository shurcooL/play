package main

import "fmt"

// TRY:
// github.com/pmezard/go-difflib/difflib
// maybe http://godoc.org/github.com/kylelemons/godebug/diff

func main() {
}

func Diff() {
	diff := UnifiedDiff{
		A:        difflib.SplitLines("foo\nbar\n"),
		B:        difflib.SplitLines("foo\nbaz\n"),
		FromFile: "Original",
		ToFile:   "Current",
		Context:  3,
	}
	text, _ := GetUnifiedDiffString(diff)
	fmt.Printf(text)
}
