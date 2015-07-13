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

	"honnef.co/go/js/dom"
	"robpike.io/ivy/config"
	"robpike.io/ivy/parse"
	"robpike.io/ivy/scan"
	"robpike.io/ivy/value"
)

var document = dom.GetWindow().Document()

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
	stderr  io.Writer
	context value.Context
)

func init() {
	value.IvyEval = IvyEval
}

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
	stderr = NewWriter(document.GetElementByID("output").(*dom.HTMLPreElement))
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

	value.SetConfig(&conf)

	context = parse.NewContext()
	value.SetContext(context)

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
			scanner := scan.New(&conf, name, bufio.NewReader(fd))
			parser := parse.NewParser(&conf, name, scanner, context)
			if !run(parser, context, interactive) {
				break
			}
		}
		return
	}

	scanner := scan.New(&conf, "<stdin>", bufio.NewReader(stdin))
	parser := parse.NewParser(&conf, "<stdin>", scanner, context)
	for !run(parser, context, true) {
	}
}

func runArgs(context value.Context) {
	scanner := scan.New(&conf, "<args>", strings.NewReader(strings.Join(flag.Args(), " ")))
	parser := parse.NewParser(&conf, "<args>", scanner, context)
	run(parser, context, false)
}

// IvyEval is the function called by value/unaryIvy to implement the ivy (eval) operation.
func IvyEval(context value.Context, str string) value.Value {
	scanner := scan.New(&conf, "<ivy>", strings.NewReader(str))
	parser := parse.NewParser(&conf, "<ivy>", scanner, context)
	return eval(parser, context)
}

// run runs until EOF or error. The return value says whether we completed without error.
func run(p *parse.Parser, context value.Context, interactive bool) (success bool) {
	writer := conf.Output()
	defer func() {
		if conf.Debug("panic") {
			return
		}
		err := recover()
		if err == nil {
			return
		}
		p.FlushToNewline()
		if err, ok := err.(value.Error); ok {
			fmt.Fprintf(stderr, "%s%s\n", p.Loc(), err)
			if interactive {
				fmt.Fprintln(writer)
			}
			success = false
			return
		}
		panic(err)
	}()
	for {
		if interactive {
			fmt.Fprint(writer, conf.Prompt())
		}
		exprs, ok := p.Line()
		var values []value.Value
		if exprs != nil {
			values = context.Eval(exprs)
		}
		if values != nil {
			printValues(writer, values)
			context.Assign("_", values[len(values)-1])
		}
		if !ok {
			return true
		}
		if interactive {
			fmt.Fprintln(writer)
		}
	}
}

// eval runs until EOF or error. It prints every value but the last, and returns the last.
// By last we mean the last expression of the last evaluation.
// (Expressions are separated by ; in the input.)
// It is always called from (somewhere below) run, so if it errors out the recover in
// run will catch it.
func eval(p *parse.Parser, context value.Context) value.Value {
	writer := conf.Output()
	var prevValues []value.Value
	for {
		exprs, ok := p.Line()
		var values []value.Value
		if exprs != nil {
			values = context.Eval(exprs)
		}
		if !ok {
			if len(prevValues) == 0 {
				return nil
			}
			printValues(writer, prevValues[:len(prevValues)-1])
			return prevValues[len(prevValues)-1]
		}
		printValues(writer, prevValues)
		prevValues = values
	}
}

// printValues neatly prints the values returned from execution, followed by a newilne.
// It also handles the ')debug types' output.
func printValues(writer io.Writer, values []value.Value) {
	if len(values) == 0 {
		return
	}
	if conf.Debug("types") {
		for i, v := range values {
			if i > 0 {
				fmt.Fprint(writer, ",")
			}
			fmt.Fprintf(writer, "%T", v)
		}
		fmt.Fprintln(writer)
	}
	for i, v := range values {
		s := v.String()
		if i > 0 && len(s) > 0 && s[len(s)-1] != '\n' {
			fmt.Fprint(writer, " ")
		}
		fmt.Fprint(writer, s)
	}
	fmt.Fprintln(writer)
}

func usage() {
	fmt.Fprintf(os.Stderr, "usage: ivy [options] [file ...]\n")
	fmt.Fprintf(os.Stderr, "Flags:\n")
	flag.PrintDefaults()
	os.Exit(2)
}
