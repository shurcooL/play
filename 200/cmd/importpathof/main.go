// importpathof prints the import path of a compiled Go binary.
package main

import (
	"debug/elf"
	"debug/gosym"
	"debug/macho"
	"debug/pe"
	"errors"
	"flag"
	"fmt"
	"go/build"
	"log"
	"os"
	"path/filepath"
	"strings"
)

// table extracts a Go symbol and line number table embedded in Go binary
// that file points to.
func table(file string) (*gosym.Table, error) {
	f, err := os.Open(file)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var (
		pclntab []byte
		text    uint64
		symtab  []byte
	)
	if o, err := macho.NewFile(f); err == nil {
		s := o.Section("__gopclntab")
		if s == nil {
			return nil, errors.New("empty __gopclntab")
		}
		if pclntab, err = s.Data(); err != nil {
			return nil, err
		}

		s = o.Section("__text")
		if s == nil {
			return nil, errors.New("empty __text")
		}
		text = s.Addr

		s = o.Section("__gosymtab")
		if s != nil { // Treat a missing gosymtab section as an empty one.
			symtab, err = s.Data()
			if err != nil {
				return nil, err
			}
		}
	} else if o, err := elf.NewFile(f); err == nil {
		s := o.Section(".gopclntab")
		if s == nil {
			return nil, errors.New("empty .gopclntab")
		}
		if pclntab, err = s.Data(); err != nil {
			return nil, err
		}

		s = o.Section(".text")
		if s == nil {
			return nil, errors.New("empty .text")
		}
		text = s.Addr

		s = o.Section(".gosymtab")
		if s != nil { // Treat a missing gosymtab section as an empty one.
			symtab, err = s.Data()
			if err != nil {
				return nil, err
			}
		}
	} else if _, err := pe.NewFile(f); err == nil {
		// TODO.
		return nil, fmt.Errorf("support for Windows PE binaries is not implemented yet")
	} else {
		return nil, err
	}

	pcln := gosym.NewLineTable(pclntab, text)
	return gosym.NewTable(symtab, pcln)
}

// mainFile returns the path to file containing main function in table.
func mainFile(table *gosym.Table) (string, error) {
	main := table.LookupFunc("main.main")
	if main == nil {
		return "", fmt.Errorf("not found")
	}
	file, _, fn := table.PCToLine(main.Entry)
	if fn == nil {
		return "", fmt.Errorf("not found")
	}
	return file, nil
}

// importPath returns the import path of Go package that file belongs to.
func importPath(file string) (string, error) {
	path, _ := filepath.Split(file)
	path = path[:len(path)-1] // Remove trailing slash. TODO: Better.
	for _, srcRoot := range build.Default.SrcDirs() {
		if strings.HasPrefix(path, srcRoot) {
			return path[len(srcRoot)+1:], nil
		}
	}
	return "", fmt.Errorf("couldn't find an import path corresponding to %q", file)
}

func run() error {
	table, err := table(flag.Arg(0))
	if err != nil {
		return err
	}
	file, err := mainFile(table)
	if err != nil {
		return err
	}
	importPath, err := importPath(file)
	if err != nil {
		return err
	}

	fmt.Println(importPath)
	return nil
}

func main() {
	flag.Parse()
	if flag.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: importpathof file")
		os.Exit(2)
	}

	err := run()
	if err != nil {
		log.Fatalln(err)
	}
}
