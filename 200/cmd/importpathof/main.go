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
		if s := o.Section("__gopclntab"); s == nil {
			return nil, errors.New("empty __gopclntab")
		} else {
			if pclntab, err = s.Data(); err != nil {
				return nil, err
			}
		}
		if s := o.Section("__text"); s == nil {
			return nil, errors.New("empty __text")
		} else {
			text = s.Addr
		}
		if s := o.Section("__gosymtab"); s != nil { // Treat a missing gosymtab section as an empty one.
			if symtab, err = s.Data(); err != nil {
				return nil, err
			}
		}
	} else if o, err := elf.NewFile(f); err == nil {
		if s := o.Section(".gopclntab"); s == nil {
			return nil, errors.New("empty .gopclntab")
		} else {
			if pclntab, err = s.Data(); err != nil {
				return nil, err
			}
		}
		if s := o.Section(".text"); s == nil {
			return nil, errors.New("empty .text")
		} else {
			text = s.Addr
		}
		if s := o.Section(".gosymtab"); s != nil { // Treat a missing gosymtab section as an empty one.
			if symtab, err = s.Data(); err != nil {
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
	// TODO: Consider build.Default.SrcDirs().
	workspaces := filepath.SplitList(build.Default.GOPATH)
	for _, w := range workspaces {
		srcRoot := filepath.Join(w, "src")
		if strings.HasPrefix(path, srcRoot) {
			return path[len(srcRoot)+1:], nil
		}
	}
	return "", fmt.Errorf("not found")
}

func run() error {
	flag.Parse()

	if flag.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: importpathof file")
		os.Exit(2)
	}

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
	err := run()
	if err != nil {
		log.Fatalln(err)
	}
}

/*func getTable_1(r io.ReaderAt) (pclntab []byte, text uint64, symtab []byte, _ error) {
	obj, err := elf.NewFile(r)
	if err != nil {
		return nil, 0, nil, err
	}

	if sect := obj.Section(".gopclntab"); sect == nil {
		return nil, 0, nil, errors.New("empty .gopclntab")
	} else {
		if pclntab, err = sect.Data(); err != nil {
			return nil, 0, nil, err
		}
	}
	if sect := obj.Section(".text"); sect == nil {
		return nil, 0, nil, errors.New("empty .text")
	} else {
		text = sect.Addr
	}
	if sect := obj.Section(".gosymtab"); sect == nil {
		return nil, 0, nil, errors.New("empty .gosymtab")
	} else {
		if symtab, err = sect.Data(); err != nil {
			return nil, 0, nil, err
		}
	}

	return pclntab, text, symtab, nil
}
func getTable_2(r io.ReaderAt) (pclntab []byte, text uint64, symtab []byte, _ error) {
	obj, err := macho.NewFile(r)
	if err != nil {
		return nil, 0, nil, err
	}

	if sect := obj.Section("__gopclntab"); sect == nil {
		return nil, 0, nil, errors.New("empty __gopclntab")
	} else {
		if pclntab, err = sect.Data(); err != nil {
			return nil, 0, nil, err
		}
	}
	if sect := obj.Section("__text"); sect == nil {
		return nil, 0, nil, errors.New("empty __text")
	} else {
		text = sect.Addr
	}
	if sect := obj.Section("__gosymtab"); sect == nil {
		return nil, 0, nil, errors.New("empty __gosymtab")
	} else {
		if symtab, err = sect.Data(); err != nil {
			return nil, 0, nil, err
		}
	}

	return pclntab, text, symtab, nil
}

func getTable_(file string) (*gosym.Table, error) {
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
	if pclntab, text, symtab, err = getTable_1(f); err == nil {
		// Do nothing.
	} else if pclntab, text, symtab, err = getTable_2(f); err == nil {
		// Do nothing.
	} else {
		return nil, err
	}

	pcln := gosym.NewLineTable(pclntab, text)
	return gosym.NewTable(symtab, pcln)
}*/

/*func getTable(filepath string) (*gosym.Table, error) {
	f, err := os.Open(filepath)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var textStart uint64
	var symtab, pclntab []byte

	obj, err := elf.NewFile(f)
	if err == nil {
		if sect := obj.Section(".text"); sect == nil {
			return nil, errors.New("empty .text")
		} else {
			textStart = sect.Addr
		}
		if sect := obj.Section(".gosymtab"); sect != nil {
			if symtab, err = sect.Data(); err != nil {
				return nil, err
			}
		} else {
			return nil, errors.New("empty .gosymtab")
		}
		if sect := obj.Section(".gopclntab"); sect != nil {
			if pclntab, err = sect.Data(); err != nil {
				return nil, err
			}
		} else {
			return nil, errors.New("empty .gopclntab")
		}

	} else {
		obj, err := macho.NewFile(f)
		if err != nil {
			return nil, err
		}

		if sect := obj.Section("__text"); sect == nil {
			return nil, errors.New("empty __text")
		} else {
			textStart = sect.Addr
		}
		if sect := obj.Section("__gosymtab"); sect != nil {
			if symtab, err = sect.Data(); err != nil {
				return nil, err
			}
		} else {
			return nil, errors.New("empty __gosymtab")
		}
		if sect := obj.Section("__gopclntab"); sect != nil {
			if pclntab, err = sect.Data(); err != nil {
				return nil, err
			}
		} else {
			return nil, errors.New("empty __gopclntab")
		}
	}

	pcln := gosym.NewLineTable(pclntab, textStart)
	return gosym.NewTable(symtab, pcln)
}*/
