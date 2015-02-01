package painkiller

import (
	"encoding/json"
	"fmt"
)

type Pill int

const (
	Placebo Pill = iota
	Aspirin
	Ibuprofen
	Paracetamol
	Acetaminophen = Paracetamol
)

//go:generate stringer -type=Pill
//go:generate gostringer -type=Pill
//go:generate jsonenums -type=Pill

// Check that all expected interfaces are implemented.
var (
	pillValue   Pill
	pillPointer *Pill

	_ fmt.Stringer     = pillValue
	_ fmt.GoStringer   = pillValue
	_ json.Marshaler   = pillValue
	_ json.Unmarshaler = pillPointer
)
