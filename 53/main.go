package main

import (
	"log"
	"os"
	"text/scanner"
)

func main() {
	var s scanner.Scanner
	s.Init(os.Stdin)
	tok := s.Scan()
	for tok != scanner.EOF {
		// do something with tok
		log.Println(s.TokenText())
		tok = s.Scan()
	}
}
