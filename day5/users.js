
const loadButton = document.getElementById("load-users");
const filterInput = document.getElementById("filter-input");
const statusMessage = document.getElementById("status");
const usersList = document.getElementById("users-list");

let users = [];

async function loadUsers() {
    loadButton.disabled = true;
    statusMessage.textContent = "Loading users...";
    usersList.replaceChildren();

    try {
        const response = await fetch(
            "https://jsonplaceholder.typicode.com/users"
        );

        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
        }

        const data = await response.json();

        users = data;
        renderUsers(users);

        statusMessage.textContent =
            `Successfully loaded ${users.length} users.`;
    } catch (error) {
        users = [];
        usersList.replaceChildren();

        statusMessage.textContent =
            "Error loading users. Please check your connection and try again.";

        console.error("Failed to load users:", error);
    } finally {
        loadButton.disabled = false;
    }
}

function renderUsers(list) {
    usersList.replaceChildren();

    if (list.length === 0) {
        statusMessage.textContent = "No users match your filter.";
        return;
    }

    list.forEach((user) => {
        const listItem = document.createElement("li");
        const nameHeading = document.createElement("h2");
        const emailParagraph = document.createElement("p");
        const cityParagraph = document.createElement("p");
        const companyParagraph = document.createElement("p");

        nameHeading.textContent = user.name;
        emailParagraph.textContent = `Email: ${user.email}`;
        cityParagraph.textContent = `City: ${user.address.city}`;
        companyParagraph.textContent =
            `Company: ${user.company.name}`;

        listItem.append(
            nameHeading,
            emailParagraph,
            cityParagraph,
            companyParagraph
        );

        usersList.appendChild(listItem);
    });
}

loadButton.addEventListener("click", loadUsers);

filterInput.addEventListener("input", () => {
    const searchText = filterInput.value.trim().toLowerCase();

    const filteredUsers = users.filter((user) =>
        user.name.toLowerCase().includes(searchText)
    );

    renderUsers(filteredUsers);

    if (filteredUsers.length > 0) {
        statusMessage.textContent =
            `Showing ${filteredUsers.length} of ${users.length} users.`;
    }
});