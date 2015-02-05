package painkiller

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
