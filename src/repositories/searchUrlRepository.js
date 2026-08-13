const { db } = require('../database/database.js')
const $logger = require('../components/Logger.js')

const getAllUrls = async () => {
    const query = `SELECT * FROM search_urls ORDER BY created DESC`
    return new Promise((resolve, reject) => {
        db.all(query, [], (error, rows) => error ? reject(error) : resolve(rows || []))
    })
}

const getActiveUrls = async () => {
    const query = `SELECT * FROM search_urls WHERE active = 1`
    return new Promise((resolve, reject) => {
        db.all(query, [], (error, rows) => error ? reject(error) : resolve(rows || []))
    })
}

const createUrl = async (url, label) => {
    const query = `INSERT INTO search_urls( url, label, active, created ) VALUES( ?, ?, 1, ? )`
    const now = new Date().toISOString()
    return new Promise((resolve, reject) => {
        db.run(query, [url, label || null, now], function (error) {
            if (error) return reject(error)
            resolve({ id: this.lastID, url, label: label || null, active: 1, created: now })
        })
    })
}

const setActive = async (id, active) => {
    const query = `UPDATE search_urls SET active = ? WHERE id = ?`
    return new Promise((resolve, reject) => {
        db.run(query, [active ? 1 : 0, id], (error) => error ? reject(error) : resolve(true))
    })
}

const deleteUrl = async (id) => {
    const query = `DELETE FROM search_urls WHERE id = ?`
    return new Promise((resolve, reject) => {
        db.run(query, [id], (error) => error ? reject(error) : resolve(true))
    })
}

const countUrls = async () => {
    const query = `SELECT COUNT(*) as total FROM search_urls`
    return new Promise((resolve, reject) => {
        db.get(query, [], (error, row) => error ? reject(error) : resolve(row.total))
    })
}

module.exports = { getAllUrls, getActiveUrls, createUrl, setActive, deleteUrl, countUrls }
