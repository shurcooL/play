package git

import "fmt"

func parseLsTreeLine(s string) (lsTreeLine, error) {
	// Format is:
	// <mode> SP <type> SP <object> SP <object size> TAB <file>

	// TODO: Optimize.
	var l lsTreeLine
	_, err := fmt.Sscanf(s, "%s %s %s %s\t%s", &l.mode, &l.typ, &l.object, &l.size, &l.file)
	return l, err
}

type lsTreeLine struct {
	mode   string
	typ    string
	object string
	size   string
	file   string
}
