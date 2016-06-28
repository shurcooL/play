// +build js

// Copyright 2014 The Go Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

package main

import (
	"bufio"
	"flag"
	"fmt"
	"io"
	"os"
	"strings"

	"robpike.io/ivy/config"
	"robpike.io/ivy/exec"
	"robpike.io/ivy/parse"
	"robpike.io/ivy/run"
	"robpike.io/ivy/scan"
	"robpike.io/ivy/value"

	"honnef.co/go/js/dom"
)

var (
	execute   = flag.Bool("e", false, "execute arguments as a single expression")
	format    = flag.String("format", "", "use `fmt` as format for printing numbers; empty sets default format")
	gformat   = flag.Bool("g", false, `shorthand for -format="%.12g"`)
	maxbits   = flag.Uint("maxbits", 1e9, "maximum size of an integer, in bits; 0 means no limit")
	maxdigits = flag.Uint("maxdigits", 1e4, "above this many `digits`, integers print as floating point; 0 disables")
	origin    = flag.Int("origin", 1, "set index origin to `n` (must be 0 or 1)")
	prompt    = flag.String("prompt", "", "command `prompt`")
	debugFlag = flag.String("debug", "", "comma-separated `names` of debug settings to enable")
)

var (
	conf    config.Config
	context value.Context
)

var document = dom.GetWindow().Document()

func main() {
	flag.Usage = usage
	flag.Parse()

	if *origin != 0 && *origin != 1 {
		fmt.Fprintf(os.Stderr, "ivy: illegal origin value %d\n", *origin)
		os.Exit(2)
	}

	// The default os.Stdout, os.Stderr are printed to browser's console, which isn't a friendly interface.
	// Create an implementation of stdout, stderr, stdin that uses a <pre> and <input> html elements.
	stdout := NewWriter(document.GetElementByID("output").(*dom.HTMLPreElement))
	stderr := NewWriter(document.GetElementByID("output").(*dom.HTMLPreElement))
	stdin := NewReader(document.GetElementByID("input").(*dom.HTMLInputElement))

	// Send a copy of stdin to stdout (like in most terminals).
	stdin = io.TeeReader(stdin, stdout)

	// When console is clicked, focus the input element.
	// TODO: Make it possible/friendlier to copy the text from stdout...
	document.GetElementByID("console").AddEventListener("click", false, func(event dom.Event) {
		document.GetElementByID("input").(dom.HTMLElement).Focus()
		event.PreventDefault()
	})

	conf.SetOutput(stdout)
	conf.SetErrOutput(stderr)

	if *gformat {
		*format = "%.12g"
	}

	conf.SetFormat(*format)
	conf.SetMaxBits(*maxbits)
	conf.SetMaxDigits(*maxdigits)
	conf.SetOrigin(*origin)
	conf.SetPrompt(*prompt)
	if len(*debugFlag) > 0 {
		for _, debug := range strings.Split(*debugFlag, ",") {
			if !conf.SetDebug(debug, true) {
				fmt.Fprintf(os.Stderr, "ivy: unknown debug flag %q", debug)
				os.Exit(2)
			}
		}
	}

	context = exec.NewContext(&conf)

	if *execute {
		runArgs(context)
		return
	}

	if flag.NArg() > 0 {
		for i := 0; i < flag.NArg(); i++ {
			name := flag.Arg(i)
			var fd io.Reader
			var err error
			interactive := false
			if name == "-" {
				interactive = true
				fd = os.Stdin
			} else {
				interactive = false
				fd, err = os.Open(name)
			}
			if err != nil {
				fmt.Fprintf(os.Stderr, "ivy: %s\n", err)
				os.Exit(1)
			}
			scanner := scan.New(context, name, bufio.NewReader(fd))
			parser := parse.NewParser(name, scanner, context)
			if !run.Run(parser, context, interactive) {
				break
			}
		}
		return
	}

	scanner := scan.New(context, "<stdin>", bufio.NewReader(stdin))
	parser := parse.NewParser("<stdin>", scanner, context)
	for !run.Run(parser, context, true) {
	}
}

// runArgs executes the text of the command-line arguments as an ivy program.
func runArgs(context value.Context) {
	scanner := scan.New(context, "<args>", strings.NewReader(strings.Join(flag.Args(), " ")))
	parser := parse.NewParser("<args>", scanner, context)
	run.Run(parser, context, false)
}

func usage() {
	fmt.Fprintf(os.Stderr, "usage: ivy [options] [file ...]\n")
	fmt.Fprintf(os.Stderr, "Flags:\n")
	flag.PrintDefaults()
	os.Exit(2)
}
