const defaultEmployees = [
    
    {
        id: 1,
        name: "David Montaño",
        role: "Barman de primeira",
        outlet: "Sky Bar"
    },
    {
        id: 2,
        name: "José Ferro",
        role: "Chefe de bar",
        outlet: "Sky Bar"
    },
    {
        id: 3,
        name: "Marilia Campos",
        role: "Hostess",
        outlet: "Sky Bar"
    },
    {
        id: 4,
        name: "João Martins",
        role: "Barman de segunda",
        outlet: "Sky Bar"
    },
    {
        id: 5,
        name: "Clebinho Show",
        role: "Empregado de mesa de segunda",
        outlet: "Sky Bar"
    },
    {
        id: 6,
        name: "Ines Pereira",
        role: "Empregada de mesa de primeira",
        outlet: "Sky Bar"
    },
    {
        id: 7,
        name: "Paulo Roberto",
        role: "Empregado de mesa de segunda",
        outlet: "Sky Bar"
    },

    {
        id: 8,
        name: "Alberto Pereira",
        role: "Chefe de bar",
        outlet: "Wine Bar 1638"
    },
    {
        id: 9,
        name: "Jorge Silva",
        role: "Sommelier",
        outlet: "Wine Bar 1638"
    },
    {
        id: 10,
        name: "Filipe Costa",
        role: "Barman de primeira",
        outlet: "Wine Bar 1638"
    },
    {
        id: 11,
        name: "Marta Rodrigues",
        role: "Barman de segunda",
        outlet: "Wine Bar 1638"
    },
    {
        id: 12,
        name: "Tony Montana",
        role: "Empregado de mesa de primeira",
        outlet: "Wine Bar 1638"
    },
    {
        id: 13,
        name: "Nacho Lopez",
        role: "Empregado de mesa de segunda",
        outlet: "Wine Bar 1638"
    },

    {
        id: 14,
        name: "Moisés Caicedo",
        role: "Barman de primeira",
        outlet: "Wine & Jazz"
    },
    {
        id: 15,
        name: "Marisa Monteiro",
        role: "Barman de segunda",
        outlet: "Wine & Jazz"
    },
    {
        id: 16,
        name: "Josildo Ferreira",
        role: "Sommelier",
        outlet: "Wine & Jazz"
    },
    {
        id: 17,
        name: "Nicole Dias",
        role: "Empregado de mesa de primeira",
        outlet: "Wine & Jazz"
    },
    {
        id: 18,
        name: "Lucas Alves",
        role: "Empregado de mesa de segunda",
        outlet: "Wine & Jazz"
    },
    {
        id: 19,
        name: "Monica Silva",
        role: "Hostess",
        outlet: "Wine & Jazz"
    },

    {
        id: 20,
        name: "Vasco Martins",
        role: "Barman de primeira",
        outlet: "Pool Bar"
    },
    {
        id: 21,
        name: "Hugo Costa",
        role: "Barman de segunda",
        outlet: "Pool Bar"
    },
    {
        id: 22,
        name: "Marco Silva",
        role: "Barman de segunda",
        outlet: "Pool Bar"
    },
    {
        id: 23,
        name: "Leonor Sousa",
        role: "Empregada de mesa de primeira",
        outlet: "Pool Bar"
    },
    {
        id: 24,
        name: "Rita Fernandes",
        role: "Hostess",
        outlet: "Pool Bar"
    },

    {
        id: 25,
        name: "António Pereira",
        role: "Chefe de sala",
        outlet: "Restaurante 1638"
    },
    {
        id: 26,
        name: "Fábio Martins",
        role: "Subchefe de sala",
        outlet: "Restaurante 1638"
    },
    {
        id: 27,
        name: "Tomás Silva",
        role: "Empregado de mesa de primeira",
        outlet: "Restaurante 1638"
    },
    {
        id: 28,
        name: "Rodrigo Costa",
        role: "Empregado de mesa de primeira",
        outlet: "Restaurante 1638"
    },
    {
        id: 29,
        name: "Marta Almeida",
        role: "Empregada de mesa de segunda",
        outlet: "Restaurante 1638"
    },
    {
        id: 30,
        name: "Joana Ferreira",
        role: "Empregada de mesa de segunda",
        outlet: "Restaurante 1638"
    },
    {
        id: 31,
        name: "Nuno Lopes",
        role: "Sommelier",
        outlet: "Restaurante 1638"
    },

    {
    id: 32,
    name: "Ricardo Santos",
    role: "Chefe de sala",
    outlet: "Restaurante Boa Vista"
    },
    {
        id: 33,
        name: "Filipe Carvalho",
        role: "Subchefe de sala",
        outlet: "Restaurante Boa Vista"
    },
    {
        id: 34,
        name: "Luís Oliveira",
        role: "Empregado de mesa de primeira",
        outlet: "Restaurante Boa Vista"
    },
    {
        id: 35,
        name: "André Martins",
        role: "Empregado de mesa de segunda",
        outlet: "Restaurante Boa Vista"
    },
    {
        id: 36,
        name: "Mariana Costa",
        role: "Empregada de mesa de primeira",
        outlet: "Restaurante Boa Vista"
    },
    {
        id: 37,
        name: "Beatriz Lopes",
        role: "Hostess",
        outlet: "Restaurante Boa Vista"
    },

    {
        id: 38,
        name: "Carlos Mendes",
        role: "Chefe de cozinha",
        outlet: "Cozinha 1638"
    },
    {
        id: 39,
        name: "João Pereira",
        role: "Subchefe de cozinha",
        outlet: "Cozinha 1638"
    },
    {
        id: 40,
        name: "Diogo Silva",
        role: "Cozinheiro de primeira",
        outlet: "Cozinha 1638"
    },
    {
        id: 41,
        name: "Bruno Martins",
        role: "Cozinheiro de primeira",
        outlet: "Cozinha 1638"
    },
    {
        id: 42,
        name: "Pedro Costa",
        role: "Cozinheiro de segunda",
        outlet: "Cozinha 1638"
    },
    {
        id: 43,
        name: "Rafael Almeida",
        role: "Cozinheiro de segunda",
        outlet: "Cozinha 1638"
    },

    {
        id: 44,
        name: "Miguel Ferreira",
        role: "Chefe de cozinha",
        outlet: "Cozinha Central (Boa Vista)"
    },
    {
        id: 45,
        name: "André Lopes",
        role: "Subchefe de cozinha",
        outlet: "Cozinha Central (Boa Vista)"
    },
    {
        id: 46,
        name: "Tiago Santos",
        role: "Cozinheiro de primeira",
        outlet: "Cozinha Central (Boa Vista)"
    },
    {
        id: 47,
        name: "Gonçalo Martins",
        role: "Cozinheiro de primeira",
        outlet: "Cozinha Central (Boa Vista)"
    },
    {
        id: 48,
        name: "Hugo Pereira",
        role: "Cozinheiro de segunda",
        outlet: "Cozinha Central (Boa Vista)"
    },
    {
        id: 49,
        name: "Marco Oliveira",
        role: "Cozinheiro de segunda",
        outlet: "Cozinha Central (Boa Vista)"
    },

    {
        id: 50,
        name: "Ana Martins",
        role: "Empregada de andares",
        outlet: "Housekeeping"
    },
    {
        id: 51,
        name: "Carla Silva",
        role: "Empregada de andares",
        outlet: "Housekeeping"
    },
    {
        id: 52,
        name: "Patrícia Costa",
        role: "Empregada de andares",
        outlet: "Housekeeping"
    },
    {
        id: 53,
        name: "Sandra Ferreira",
        role: "Empregada de andares",
        outlet: "Housekeeping"
    },
    {
        id: 54,
        name: "Daniela Santos",
        role: "Empregada de andares",
        outlet: "Housekeeping"
    },
    {
        id: 55,
        name: "Helena Almeida",
        role: "Empregada de andares",
        outlet: "Housekeeping"
    },

    {
        id: 56,
        name: "Vasco Pereira",
        role: "Chefe de sala",
        outlet: "Eventos"
    },
    {
        id: 57,
        name: "João Costa",
        role: "Barman de primeira",
        outlet: "Eventos"
    },
    {
        id: 58,
        name: "Ricardo Martins",
        role: "Barman de segunda",
        outlet: "Eventos"
    },
    {
        id: 59,
        name: "Tiago Silva",
        role: "Empregado de mesa de primeira",
        outlet: "Eventos"
    },
    {
        id: 60,
        name: "Pedro Almeida",
        role: "Empregado de mesa de primeira",
        outlet: "Eventos"
    },
    {
        id: 61,
        name: "André Santos",
        role: "Empregado de mesa de segunda",
        outlet: "Eventos"
    },
    {
        id: 62,
        name: "Inês Costa",
        role: "Hostess",
        outlet: "Eventos"
    },
    {
        id: 63,
        name: "Bruno Ferreira",
        role: "Cozinheiro de primeira",
        outlet: "Eventos"
    }
];
