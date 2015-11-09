package task

// DataᐸTᐳ where T is int.
type Dataᐸintᐳ interface {
	IsCollection() bool
	GetCollection() CollectionᐸDataᐸintᐳᐳ
	GetElement() int
}

// Java's CollectionᐸEᐳ interface (partial).

// CollectionᐸEᐳ where E is Dataᐸintᐳ.
type CollectionᐸDataᐸintᐳᐳ interface {
	IsEmpty() bool
	Iterator() IteratorᐸDataᐸintᐳᐳ
	Size() int
	// ... more methods are available in the real Java CollectionᐸEᐳ interface,
	// see http://docs.oracle.com/javase/7/docs/api/java/util/Collection.html.
}

// IteratorᐸEᐳ where E is Dataᐸintᐳ.
type IteratorᐸDataᐸintᐳᐳ interface {
	HasNext() bool
	Next() Dataᐸintᐳ
}
