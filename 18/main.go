package main

import (
	"fmt"
	"strings"
	"text/scanner"
)

var src = strings.NewReader("Okay. I don't know how to preserve history when converting bzr to git repo, but I assume you'll do that, and it won't matter for the PRs because they're diff based (or I can rebase after your git repo is created).")

func main() {
	var s scanner.Scanner
	s.Init(src)
	s.Mode = scanner.ScanIdents
	tok := s.Scan()
	for tok != scanner.EOF {
		fmt.Println(s.TokenText())
		tok = s.Scan()
	}
}
